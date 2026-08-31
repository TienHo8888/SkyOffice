# SkyOffice: Supabase + Netlify deployment

## Kiến trúc cần dùng

SkyOffice hiện có hai phần chạy khác nhau:

| Phần | Nơi chạy | Vai trò |
| --- | --- | --- |
| React/Vite + Phaser | Netlify | Tải game client tĩnh qua HTTPS |
| Colyseus + Express | Một host Node chạy liên tục | WebSocket multiplayer, room state, REST API |
| PostgreSQL | Supabase | Lưu bền vững tài khoản, progression, wallet và state của StudioStore |

Netlify không phải nơi chạy process Node giữ WebSocket. Vì vậy chỉ deploy thư mục
`client/dist` lên Netlify; deploy backend bằng `Dockerfile`, `Procfile` hoặc
`pnpm run start:prod` trên một host long-running có hỗ trợ WebSocket.

## 1. Chuẩn bị Supabase

Nên dùng một Supabase project riêng cho SkyOffice. Tài khoản hiện tại có các
project `VoLamIdle` và `Quản lý bán hàng 3D`; không chạy migration SkyOffice vào
những project đó nếu chưa xác nhận chúng không còn dữ liệu cần giữ.

Trong project SkyOffice:

1. Mở SQL Editor và chạy migration
   `supabase/migrations/20260831083455_add_studio_runtime_state.sql`.
2. Ở **Connect**, copy connection string của **Session pooler** nếu backend host
   chỉ có IPv4; dùng Direct connection khi host hỗ trợ IPv6 và phù hợp với plan.
3. Giữ nguyên placeholder password trong file mẫu; chỉ thay password trong secret
   của backend host.
4. Kiểm tra bảng `public.studio_runtime_state` đã có RLS bật. Bảng này không có
   policy cho browser role và không được truy cập trực tiếp từ client.

Migration này là persistence bridge cho StudioStore đồng bộ hiện tại. Nó lưu một
JSONB snapshot duy nhất để giữ nguyên toàn bộ domain logic và idempotency của MVP.
Đây là mô hình một backend instance; khi cần scale nhiều server, các transaction
wallet/reward nên được chuyển dần sang các bảng chuẩn hóa trong
`server/data/migrations/`.

## 2. Deploy backend realtime

Backend cần các biến môi trường sau:

```bash
NODE_ENV=production
PORT=2567
JWT_SECRET=<chuỗi ngẫu nhiên dài ít nhất 32 ký tự>
STUDIO_ADMIN_EMAIL=<email admin production>
STUDIO_ADMIN_USERNAME=<username admin production>
STUDIO_ADMIN_PASSWORD=<chuỗi ngẫu nhiên dài ít nhất 16 ký tự>
STUDIO_PERSISTENCE=supabase
SUPABASE_DB_URL=<connection string Supabase, có password thật>
STUDIO_STATE_ID=skyoffice-production
CORS_ORIGINS=https://<ten-site>.netlify.app
```

`SUPABASE_DB_URL` và password database chỉ đặt ở backend host. Không đặt chúng
trong `VITE_*`, Netlify build variables, `client/.env`, hoặc commit vào git.

`STUDIO_ADMIN_PASSWORD` là bắt buộc trong production. Không có mật khẩu admin
mặc định; các fixture tài khoản development bị tắt trong production. Nếu state
cũ có admin mặc định, backend sẽ đổi hash sang mật khẩu được cấu hình trước khi
mở server.

Các lựa chọn host phù hợp là Render, Railway, Fly.io, một VPS, hoặc bất kỳ nền
tảng nào chạy được Docker/Node process và hỗ trợ WebSocket. Project đã có:

- `Dockerfile` với Node 20 và build server production;
- `Procfile` dùng `node server/lib/server/index.js`;
- script `pnpm run build:server` và `pnpm run start:prod`;
- `GET /healthz` và `GET /api/health` để kiểm tra process/persistence.

Sau khi deploy, kiểm tra:

```bash
curl https://<backend-domain>/healthz
curl https://<backend-domain>/api/health
```

Hai endpoint phải trả HTTP 200 và `persistence.mode` là `supabase`. Backend URL
không cần thêm `/api` cho WebSocket: Colyseus dùng cùng origin, ví dụ
`wss://<backend-domain>`.

## 3. Deploy client lên Netlify

Link repository vào một Netlify site. `netlify.toml` đã cấu hình:

```toml
command = "pnpm install --frozen-lockfile && pnpm --dir client install --frozen-lockfile && pnpm --dir client run build"
publish = "client/dist"
```

Ở **Project configuration → Environment variables**, đặt cho deploy context
Production:

```bash
VITE_SERVER_URL=wss://<backend-domain>
VITE_API_URL=https://<backend-domain>/api
```

Chỉ cần `VITE_SERVER_URL` cũng được: client sẽ tự chuyển `ws://`/`wss://` thành
`http://`/`https://` rồi nối `/api`. Đặt cả hai biến sẽ dễ đọc và ít nhầm hơn.

Sau khi đổi biến môi trường phải trigger một build/deploy mới. Không đặt
`SUPABASE_DB_URL`, `JWT_SECRET` hoặc bất kỳ secret backend nào trên Netlify.

Netlify sẽ trả client qua HTTPS, nên backend phải dùng `wss://` và API phải dùng
`https://`. Hãy thêm đúng origin Netlify vào `CORS_ORIGINS`, không thêm dấu `/`
ở cuối:

```bash
CORS_ORIGINS=https://skyoffice-example.netlify.app,https://www.example.com
```

## 4. Smoke test sau deploy

1. Mở site Netlify bằng hai cửa sổ trình duyệt hoặc hai profile.
2. Đăng nhập hai tài khoản khác nhau.
3. Cả hai phải vào được Public world và thấy nhau di chuyển.
4. Gửi chat, vào Fishing/Home và mở một game realtime.
5. Nhận daily reward hoặc thay đổi avatar, restart backend, đăng nhập lại và
   kiểm tra dữ liệu vẫn còn.
6. Kiểm tra browser console không có request tới
   `https://<site-netlify>/api` hoặc WebSocket tới
   `wss://<site-netlify>`; các request phải đi tới backend domain.
7. Kiểm tra log backend không báo `Unable to load Studio state from Supabase`.

## Local production-like test

Copy `.env.example` thành `.env` ở môi trường local và để:

```bash
STUDIO_PERSISTENCE=local
VITE_SERVER_URL=ws://localhost:2567
VITE_API_URL=http://localhost:2567/api
```

Chạy:

```bash
pnpm install --frozen-lockfile
pnpm --dir client install --frozen-lockfile
pnpm run typecheck:server
pnpm --dir client run typecheck
pnpm --dir client run build
pnpm run start
```

Khi test với Supabase thật, thay `STUDIO_PERSISTENCE=supabase` và đặt
`SUPABASE_DB_URL` trong shell/backend host; không sửa `.env.example` để chèn
secret.

## Những giới hạn cần biết trước khi public game

- Đây vẫn là một Colyseus server instance. Không chạy nhiều replica cùng lúc nếu
  chưa thêm Redis presence/driver và transaction SQL chuẩn hóa.
- Database snapshot được ghi theo queue sau mỗi mutation. Nếu DB down, server
  giữ state trong memory nhưng `/healthz` chuyển sang 503 và log lỗi; cần xử lý
  lỗi trước khi coi deploy là healthy.
- Auth hiện tại là session HMAC do server quản lý. Supabase đang đóng vai trò
  PostgreSQL persistence; chuyển sang Supabase Auth là một migration riêng,
  không cần để client online multiplayer hoạt động.
- PeerJS video/screen share vẫn phụ thuộc signaling/ICE của PeerJS; nên kiểm tra
  trên hai mạng khác nhau nếu bật tính năng camera.
