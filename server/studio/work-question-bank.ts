import { WorkCareerId, WorkChallengeImage, WorkChallengeOption, WorkRankId } from '../../types/Work'

export type WorkDifficulty = 1 | 2 | 3 | 4 | 5 | 6

export interface WorkBankQuestion {
  id: string
  careerId: WorkCareerId
  difficulty: WorkDifficulty
  topic: string
  title: string
  prompt: string
  options: WorkChallengeOption[]
  answer: string
  image?: WorkChallengeImage
}

interface KnowledgeArea {
  topic: string
  practice: string
  evidence: string
  distractors: [string, string, string]
}

const contexts = [
  'prototype nội bộ phải demo trong hôm nay nhưng thứ tự ưu tiên của các phần việc chưa rõ',
  'vertical slice sắp được stakeholder review nhưng nhiều phần chưa thống nhất về tiêu chuẩn hoàn thành',
  'bản mobile chạy trên máy cấu hình thấp bị tụt FPS khi có nhiều nội dung cùng lúc',
  'người chơi quay lại multiplayer sau khi mất mạng nhưng trạng thái reconnect bị sai',
  'live event sắp mở và lượng người dùng dự kiến tăng gấp năm lần so với bình thường',
  'bản cập nhật phải đọc được dữ liệu cũ nhưng một số trường đã đổi tên',
  'release candidate vừa phát hiện lỗi nghiêm trọng ngay trước giờ phát hành',
  'feature phải hỗ trợ accessibility và localization nhưng bản hiện tại mới kiểm tra tiếng Anh',
  'pipeline có ba team cùng bàn giao deliverable nhưng format và thời điểm chưa khớp nhau',
  'A/B test cho thấy metric chính tăng nhưng retention của người chơi lại giảm',
  'hotfix cần triển khai gấp nhưng dịch vụ không được gián đoạn',
  'scope thay đổi sau khi phần lớn công việc đã hoàn tất',
  'hệ thống phải tiếp tục an toàn khi người chơi mất mạng tạm thời',
  'sản phẩm phải chạy trên nhiều tỉ lệ màn hình và nhiều kiểu input',
  'telemetry cho kết quả khác với phản hồi định tính của người chơi',
  'team mới tiếp quản một module nhưng tài liệu hiện tại thiếu nhiều phần',
  'một dependency bên thứ ba vừa đổi API và bản build bắt đầu lỗi',
  'postmortem cho thấy cùng một lỗi đã lặp lại lần thứ hai',
  'slot 5×3 có wild, scatter và free-spin nhưng team chưa xác nhận RTP sau khi đổi paytable',
  'slot cascading reels cần cân bằng volatility, hit frequency và max exposure trước khi ra mắt',
  'sportsbook nhận feed trận đấu trễ hoặc mâu thuẫn nên cần suspend market đúng lúc',
  'odds pre-match và in-play đổi nhanh trong lúc người chơi đang đặt betting',
  'bàn Baccarat/Roulette live có video trễ hơn game-state và betting window',
  'table betting có side bet với payout table và giới hạn cược riêng',
  'card game Poker có all-in, side pot và reconnect giữa hand',
  'Blackjack nhiều deck phải xử lý split, double, insurance và dealer rule theo jurisdiction',
  'Crash game nhận cash-out sát lúc multiplier bust trong điều kiện latency cao',
  'Crash game phải công bố cơ chế provably fair nhưng không được lộ server seed trước round',
  'wallet real-money phải reserve, settle, rollback và reconcile betting theo double-entry ledger',
  'bonus có wagering requirement đang bị khai thác bằng matched betting và multi-account',
  'người chơi đã self-exclude nhưng vẫn còn session và wager chưa settle',
  'KYC/AML phát hiện source-of-funds bất thường sau chuỗi nạp, rút và betting rủi ro thấp',
  'game aggregator gửi callback duplicate, out-of-order và timeout khi settlement',
  'gói RNG/game math chuẩn bị nộp lab độc lập để certification',
  'một jurisdiction mới yêu cầu limit, reality check và audit trail khác thị trường hiện tại',
  'dashboard GGR tăng mạnh nhưng NGR, retention và responsible-gambling indicator lại xấu đi',
] as const

const areas: Record<WorkCareerId, KnowledgeArea[]> = {
  ART: [
    { topic: 'value structure và focal hierarchy', practice: 'khóa value thumbnail trước, kiểm tra silhouette và điểm nhìn ở kích thước sử dụng thật', evidence: 'grayscale thumbnail, squint test và ảnh chụp ở target resolution', distractors: ['thêm chi tiết đều lên mọi vùng', 'chọn màu bão hòa nhất làm focal point', 'render hoàn thiện trước rồi mới kiểm tra value'] },
    { topic: 'color pipeline', practice: 'xác định color space, profile xuất và kiểm tra gamut ngay từ đầu pipeline', evidence: 'ICC/profile, export preset và ảnh đối chiếu trên thiết bị mục tiêu', distractors: ['chỉnh màu riêng trên từng màn hình không quản lý profile', 'tăng saturation để bù sai lệch', 'bỏ qua linear/sRGB vì engine sẽ tự sửa'] },
    { topic: 'modular environment art', practice: 'thiết kế kit theo grid, texel density và pivot convention thống nhất trước khi nhân bản', evidence: 'kit sheet, grid metrics và scene kiểm tra snap/pivot', distractors: ['model từng asset độc lập không theo module', 'scale texture bằng mắt ở từng prefab', 'đặt pivot tùy ý để bố cục tự nhiên hơn'] },
    { topic: 'PBR material authoring', practice: 'tách đúng thuộc tính vật lý, giữ roughness có biến thiên hợp lý và kiểm tra dưới nhiều HDRI', evidence: 'material channel breakdown và turntable dưới neutral/multiple lighting', distractors: ['vẽ highlight trực tiếp vào albedo', 'dùng metallic trung gian cho mọi vật liệu', 'chỉ duyệt material dưới một ánh sáng đẹp'] },
    { topic: 'UV và texture budget', practice: 'phân bổ UV theo mật độ nhìn thấy, reuse/trim sheet và chừa padding theo mip target', evidence: 'texel-density overlay, UV occupancy và kiểm tra mip bleeding', distractors: ['cho mọi mặt cùng diện tích UV', 'xếp island sát nhau để đạt 100% occupancy', 'tăng texture lên 4K cho mọi asset'] },
    { topic: 'shape language và style consistency', practice: 'định nghĩa shape grammar, tỉ lệ và mức độ chi tiết bằng style guide có ví dụ đúng/sai', evidence: 'style matrix, lineup silhouette và paint-over consistency review', distractors: ['để từng artist tự diễn giải style', 'chỉ dùng chung một palette là đủ', 'sửa khác biệt style ở cuối production'] },
    { topic: 'UI iconography', practice: 'ưu tiên silhouette phân biệt, optical weight đồng đều và test ở kích thước nhỏ nhất', evidence: 'icon grid, blur/small-size test và contrast report', distractors: ['thêm nhiều chi tiết để icon độc đáo', 'căn hình học tuyệt đối thay vì optical alignment', 'dùng màu làm dấu hiệu phân biệt duy nhất'] },
    { topic: 'asset optimization', practice: 'đo overdraw, draw call, memory và LOD theo camera/use case trước khi tối ưu', evidence: 'frame capture, memory report và LOD transition capture', distractors: ['giảm polygon đồng loạt 50%', 'gộp mọi material thành một shader phức tạp', 'tối ưu theo kích thước file nguồn'] },
    { topic: 'lighting readability', practice: 'tổ chức key/fill/accent theo gameplay readability và kiểm tra exposure ở các tình huống biên', evidence: 'lighting-only pass, exposure range và gameplay heatmap', distractors: ['đặt nhiều nguồn sáng để không còn vùng tối', 'dùng bloom để làm mọi điểm quan trọng nổi bật', 'khóa exposure theo một shot cinematic'] },
    { topic: 'art handoff và source control', practice: 'bàn giao source, export, naming, dependency và validation preset có version rõ ràng', evidence: 'manifest tái tạo được asset cùng automated import validation', distractors: ['chỉ giao file đã flatten để tránh nhầm', 'đổi tên file sau khi import cho dễ đọc', 'gửi bản mới qua chat mà không cập nhật manifest'] },
    { topic: 'slot symbol hierarchy và paytable readability', practice: 'phân cấp low/high symbol, wild, scatter và bonus bằng silhouette, value và animation cue không gây nhầm payout', evidence: 'symbol recognition test ở tốc độ spin thật cùng paytable comprehension study', distractors: ['dùng màu vàng cho mọi symbol trả thưởng cao', 'làm scatter giống wild để theme đồng nhất', 'chỉ duyệt symbol trên concept sheet phóng lớn'] },
    { topic: 'slot reel strip và win presentation', practice: 'thiết kế reel background, line highlight và win frame tách bạch kết quả RNG khỏi phần trình diễn', evidence: 'capture nhiều win pattern đối chiếu outcome log và readability timing', distractors: ['cho VFX che symbol để tăng cảm giác thắng', 'đổi vị trí symbol trong lúc celebrate', 'kéo dài mọi win animation theo số tiền tuyệt đối'] },
    { topic: 'live table betting visual language', practice: 'chuẩn hóa chip denomination, betting spot, trạng thái open/closed/settled và kết quả theo một visual grammar', evidence: 'table-state matrix, color-blind test và capture ở video bitrate thấp', distractors: ['dùng màu làm dấu hiệu trạng thái duy nhất', 'để chip che nhãn cửa cược', 'thay layout betting spot theo từng theme'] },
    { topic: 'card game suit và hand readability', practice: 'giữ rank/suit đọc được ở kích thước nhỏ, phân biệt face-down, selected, winning và disabled bằng nhiều cue', evidence: 'fan-hand test trên mobile và accessibility contrast report', distractors: ['thu nhỏ artwork lá bài nguyên bản', 'chỉ dùng glow để báo lá thắng', 'đổi hình suit theo theme dù mất nhận diện'] },
    { topic: 'crash multiplier tension art', practice: 'tạo nhịp căng thẳng nhưng giữ multiplier, stake, cash-out và bust state luôn ưu tiên thị giác', evidence: 'eye-tracking/click accuracy quanh cash-out cùng capture ở multiplier cao', distractors: ['tăng screen shake liên tục theo multiplier', 'cho VFX phủ nút cash-out lúc gần bust', 'đổi vị trí multiplier để tạo bất ngờ'] },
    { topic: 'responsible-gambling UI art', practice: 'thiết kế limit, reality check, loss/net position và self-exclusion trung tính, rõ ràng, không dùng dark pattern', evidence: 'compliance checklist, comprehension test và contrast/focus audit', distractors: ['làm cảnh báo nhỏ để không phá immersion', 'dùng màu tích cực cho net loss', 'đặt nút tiếp tục nổi hơn nút dừng chơi'] },
  ],
  ANIMATION: [
    { topic: 'timing, spacing và weight', practice: 'khóa key pose và spacing curve theo khối lượng trước khi thêm secondary motion', evidence: 'blocking playblast, trajectory arc và curve editor capture', distractors: ['chia frame đều để chuyển động mượt', 'thêm motion blur để tạo cảm giác nặng', 'polish overlap trước khi chốt key pose'] },
    { topic: 'anticipation và readability', practice: 'dùng anticipation đủ đọc theo camera và cancel window nhưng không làm chậm input feedback', evidence: 'frame count breakdown và capture ở gameplay camera', distractors: ['kéo anticipation dài nhất có thể', 'bỏ anticipation cho mọi action nhanh', 'chỉ đánh giá ở camera cận cảnh'] },
    { topic: 'animation state machine', practice: 'định nghĩa guard, priority, exit condition và fallback cho từng transition', evidence: 'state graph có điều kiện cùng log transition runtime', distractors: ['cho phép any-state chuyển tới mọi state', 'dùng timer cố định cho mọi transition', 'giữ state cuối khi điều kiện không hợp lệ'] },
    { topic: 'root motion và gameplay authority', practice: 'chốt rõ nguồn authority di chuyển và đồng bộ root delta với collision/gameplay', evidence: 'root trajectory so với capsule và network replay', distractors: ['trộn root motion với code movement không quy ước', 'bù sai lệch bằng một bước nhảy vị trí cuối clip', 'để animation tự quyết hit distance'] },
    { topic: 'blend tree và locomotion', practice: 'sample vận tốc/hướng có dead zone, phase alignment và foot-lock phù hợp', evidence: 'blend-space visualization và foot sliding measurement', distractors: ['thêm thật nhiều sample không chuẩn hóa phase', 'blend tuyến tính cho mọi góc quay', 'ẩn foot slide bằng hiệu ứng bụi'] },
    { topic: 'combat hit timing', practice: 'đồng bộ active frame, hitbox, VFX, âm thanh và hit-stop bằng event contract', evidence: 'frame data table và capture event timeline', distractors: ['đặt hitbox theo cảm giác sau khi polish', 'cho VFX quyết định thời điểm gây damage', 'kéo active frame suốt clip để dễ trúng'] },
    { topic: 'facial animation và lip sync', practice: 'ưu tiên phoneme trọng âm, eye intent và coarticulation thay vì map từng âm máy móc', evidence: 'audio waveform, viseme track và review không âm thanh', distractors: ['đổi viseme ở mọi phoneme không blend', 'chỉ animate miệng và giữ mắt cố định', 'scale jaw theo âm lượng duy nhất'] },
    { topic: 'retargeting', practice: 'chuẩn hóa rest pose, bone mapping, scale và kiểm tra contact sau retarget', evidence: 'retarget profile cùng contact-error comparison', distractors: ['sửa từng clip thủ công mà không sửa profile', 'scale root để bù mọi sai lệch', 'bỏ qua twist bone nếu silhouette gần đúng'] },
    { topic: 'animation compression', practice: 'đặt tolerance theo bone perceptual importance và đo lỗi ở end-effector', evidence: 'compression report, memory delta và max positional error', distractors: ['dùng cùng tolerance cho mọi bone', 'giảm sample rate đến khi file đủ nhỏ', 'chỉ so sánh dung lượng không xem motion'] },
    { topic: 'networked animation', practice: 'replicate gameplay state tối thiểu, dự đoán hợp lý và reconcile mà không replay cosmetic event', evidence: 'packet-loss capture và deterministic event log', distractors: ['stream toàn bộ bone transform mỗi frame', 'phát lại mọi notify sau reconcile', 'đợi server xác nhận rồi mới phát locomotion'] },
    { topic: 'slot anticipation và near-miss animation', practice: 'chỉ phát anticipation theo rule đã phê duyệt, không biến losing outcome thành tín hiệu gây hiểu sai xác suất', evidence: 'event-to-outcome mapping đối chiếu math spec và jurisdiction requirement', distractors: ['phát anticipation cho mọi lần còn thiếu một scatter', 'tăng near-miss giả để giữ người chơi', 'cho animation quyết định dừng reel chậm hơn RNG'] },
    { topic: 'slot cascade và free-spin sequencing', practice: 'xếp cascade, multiplier increment, retrigger và total-win theo state machine có thể skip an toàn', evidence: 'timeline test cho chain dài, skip/resume và outcome ledger', distractors: ['phát song song mọi cascade để nhanh hơn', 'cộng multiplier theo thời điểm VFX kết thúc', 'reset total-win khi người chơi skip'] },
    { topic: 'live dealer result synchronization', practice: 'đồng bộ dealer gesture, card/ball result overlay và settlement event theo authoritative timestamp với tolerance rõ', evidence: 'video/game-state drift measurement và replay theo round ID', distractors: ['delay settlement đến khi video bắt kịp hoàn toàn', 'cho overlay đoán result từ hình ảnh', 'phát result animation khi feed đầu tiên đến'] },
    { topic: 'card dealing và side-pot animation', practice: 'tách logic pot/turn khỏi presentation, queue deal/chip motion và reconcile bằng snapshot khi reconnect', evidence: 'hand replay có all-in nhiều tầng và reconnect giữa animation', distractors: ['tính pot từ vị trí chip animation', 'bỏ qua action khi animation trước chưa xong', 'tua lại toàn bộ hand sau reconnect'] },
    { topic: 'crash cash-out feedback timing', practice: 'phản hồi input ngay nhưng phân biệt pending với accepted; animation thắng chỉ chạy sau server acknowledgement', evidence: 'latency simulation so input, acknowledgement, bust và settlement timestamp', distractors: ['hiện success ngay khi click cash-out', 'khóa nút trước khi round gần bust', 'đồng bộ cash-out bằng frame rate client'] },
    { topic: 'bet settlement celebration governance', practice: 'scale celebration theo outcome đã settle, tôn trọng reduced motion và giới hạn hiệu ứng với loss/near-miss', evidence: 'animation policy matrix theo outcome, jurisdiction và accessibility setting', distractors: ['celebrate tổng payout dù net result âm', 'dùng loss-disguised-as-win cho mọi payout', 'bỏ reduced-motion trong jackpot sequence'] },
  ],
  GAME_DESIGN: [
    { topic: 'core loop', practice: 'mô tả action-feedback-decision-reward thành loop đo được và prototype giả thuyết rủi ro nhất', evidence: 'playable loop cùng metric thời gian tới quyết định có ý nghĩa', distractors: ['viết toàn bộ feature list trước prototype', 'thêm reward dày để che loop yếu', 'đánh giá loop qua độ dài tài liệu'] },
    { topic: 'systems balance', practice: 'xác định source, sink, rate và equilibrium rồi mô phỏng cả hành vi tối ưu lẫn biên', evidence: 'economy model, sensitivity analysis và telemetry cohort', distractors: ['chỉnh từng con số theo cảm giác riêng lẻ', 'tăng mọi reward khi người chơi phàn nàn', 'chỉ cân bằng theo người chơi trung bình'] },
    { topic: 'difficulty curve', practice: 'tăng tải nhận thức có nhịp, xen kẽ mastery check và recovery, dựa trên fail reason', evidence: 'completion funnel theo skill segment và heatmap fail reason', distractors: ['tăng HP/damage đều theo level', 'giảm toàn bộ độ khó khi completion thấp', 'dùng thời gian chơi làm proxy duy nhất'] },
    { topic: 'onboarding', practice: 'dạy trong ngữ cảnh bằng hành động có feedback, chỉ giới thiệu khái niệm ngay trước lúc cần', evidence: 'time-to-first-success và quan sát người chơi không hướng dẫn', distractors: ['đưa toàn bộ rule vào popup đầu game', 'khóa input tới khi đọc hết tutorial', 'dùng tooltip lặp lại thay cho feedback'] },
    { topic: 'player agency', practice: 'thiết kế lựa chọn có thông tin, trade-off và hậu quả phân biệt nhưng vẫn phục hồi được', evidence: 'choice distribution và phỏng vấn lý do lựa chọn', distractors: ['ẩn toàn bộ xác suất để tạo bất ngờ', 'cho một lựa chọn luôn tối ưu', 'dùng nhánh giả rồi trả về cùng kết quả ngay'] },
    { topic: 'reward schedule', practice: 'khớp reward với mastery và nhịp session, tránh incentive phá hành vi mong muốn', evidence: 'reward cadence, behavior shift và retention theo cohort', distractors: ['thưởng lớn nhất cho hành động lặp nhanh nhất', 'dùng streak mất trắng để ép quay lại', 'tăng reward mà không kiểm tra inflation'] },
    { topic: 'level pacing', practice: 'đặt beat theo tension-release, landmark và learning objective của từng đoạn', evidence: 'beat map, traversal time và death/hesitation heatmap', distractors: ['phân bố encounter theo khoảng cách đều', 'đặt content khó nhất ở cuối vì còn chỗ', 'dùng cùng nhịp cho mọi player archetype'] },
    { topic: 'multiplayer fairness', practice: 'tách skill expression khỏi lợi thế tích lũy và đo fairness theo matchup/context', evidence: 'matchup matrix, win rate theo skill band và latency bucket', distractors: ['cân bằng chỉ theo win rate toàn cục', 'nerf lựa chọn phổ biến nhất', 'coi pick rate thấp đồng nghĩa yếu'] },
    { topic: 'live-ops experimentation', practice: 'đặt hypothesis, guardrail, sample và stopping rule trước khi chạy thử nghiệm', evidence: 'experiment plan cùng primary/guardrail metric đã đăng ký', distractors: ['chọn metric tốt nhất sau khi xem dữ liệu', 'dừng test ngay khi đạt significance tạm thời', 'chạy nhiều thay đổi trong cùng một variant'] },
    { topic: 'accessible game design', practice: 'cung cấp nhiều kênh thông tin và tùy chỉnh challenge mà không phá mục tiêu cốt lõi', evidence: 'accessibility test theo impairment scenario và completion delta', distractors: ['tạo một easy mode chung cho mọi nhu cầu', 'chỉ thêm colorblind filter ở cuối', 'loại bỏ toàn bộ challenge để tăng accessibility'] },
    { topic: 'slot math: RTP, volatility và hit frequency', practice: 'thiết kế paytable/reel model từ target RTP, volatility, hit frequency, max win và feature contribution rồi mô phỏng tail risk', evidence: 'PAR sheet, theoretical calculation và hàng triệu/billions spin simulation theo confidence interval', distractors: ['cân slot chỉ bằng average payout của vài nghìn spin', 'tăng jackpot rồi giảm ngẫu nhiên payout khác', 'coi RTP cao đồng nghĩa người chơi thắng thường xuyên'] },
    { topic: 'sports betting margin và market rules', practice: 'tính overround có chủ đích, công bố settlement rule và xác định suspend/void cho feed hoặc event bất thường', evidence: 'market rulebook, odds audit và settlement scenario matrix', distractors: ['giữ cùng margin cho mọi market/liquidity', 'settle theo feed đến đầu tiên', 'thay rule sau khi biết kết quả để giảm exposure'] },
    { topic: 'table betting và side-bet math', practice: 'tính house edge từ xác suất/payout, kiểm tra correlation và max exposure trước khi thêm side bet', evidence: 'combinatorial model hoặc simulation đối chiếu paytable và limit', distractors: ['chọn payout tròn dễ nhớ rồi theo dõi GGR', 'coi side bet độc lập với main bet', 'dùng hit frequency thay cho house edge'] },
    { topic: 'card game rule engine', practice: 'định nghĩa turn, legal action, pot/hand ranking, timeout và reconnect bằng state machine authoritative', evidence: 'rule table cùng exhaustive hand/action edge-case suite', distractors: ['để client tự loại action không hợp lệ', 'giải quyết tie theo thứ tự ghế', 'bỏ hand nếu một người reconnect'] },
    { topic: 'crash game probability và provably fair', practice: 'công bố thuật toán kiểm chứng, commit server seed trước round, kết hợp client seed/nonce và chốt bust multiplier trước bet window', evidence: 'independent verifier, seed commitment log và distribution simulation', distractors: ['tính multiplier dần trong lúc round chạy', 'công bố server seed trước khi nhận cược', 'điều chỉnh bust theo tổng liability mỗi round'] },
    { topic: 'responsible gambling và incentive design', practice: 'đặt deposit/loss/time limit, reality check và self-exclusion rõ; không dùng bonus/streak để né quyết định kiểm soát', evidence: 'RG harm-indicator analysis và compliance review của full user journey', distractors: ['thưởng bonus khi người chơi sắp chạm loss limit', 'cho phép hủy self-exclusion ngay lập tức', 'tối ưu session length mà không có harm guardrail'] },
  ],
  FRONTEND: [
    { topic: 'component architecture', practice: 'tách state ownership theo boundary, dùng composition và contract rõ thay vì prop drilling sâu', evidence: 'component contract, story states và dependency graph', distractors: ['đưa mọi state lên root component', 'tạo component mới cho từng biến thể nhỏ', 'cho child sửa trực tiếp object từ parent'] },
    { topic: 'state synchronization', practice: 'phân biệt server state, UI state và derived state; tránh lưu bản sao có thể tính lại', evidence: 'state transition test và trace nguồn cập nhật', distractors: ['copy props vào state ở mọi render', 'dùng global store cho mọi input', 'đồng bộ hai state bằng nhiều effect chéo'] },
    { topic: 'accessibility semantics', practice: 'dùng semantic element, accessible name, focus order và trạng thái được công bố đúng', evidence: 'keyboard walkthrough, accessibility tree và screen-reader capture', distractors: ['gắn role button lên mọi div clickable', 'chỉ kiểm tra contrast màu', 'dùng placeholder thay cho label'] },
    { topic: 'responsive layout', practice: 'thiết kế theo content constraint, container query/breakpoint có chủ đích và không mất chức năng', evidence: 'visual regression ở boundary width và overflow audit', distractors: ['thu nhỏ toàn bộ UI theo tỉ lệ', 'ẩn CTA khi màn hình hẹp', 'thêm breakpoint cho từng thiết bị cụ thể'] },
    { topic: 'web performance', practice: 'đo bottleneck thực bằng Core Web Vitals/profile rồi tối ưu critical path và bundle', evidence: 'performance trace, bundle diff và field metric percentile', distractors: ['memoize mọi component', 'lazy-load cả nội dung above-the-fold', 'đánh giá bằng điểm Lighthouse một lần'] },
    { topic: 'async UI và race condition', practice: 'gắn request với lifecycle, hủy/stale-guard response và biểu diễn loading/error/empty riêng', evidence: 'network throttling test và deterministic race test', distractors: ['response về sau luôn ghi đè state', 'disable toàn trang tới khi request xong', 'nuốt lỗi để UI không giật'] },
    { topic: 'form validation', practice: 'validate theo schema ở boundary, báo lỗi gắn với field và giữ dữ liệu người dùng', evidence: 'schema test, keyboard flow và error recovery capture', distractors: ['chỉ validate khi submit và xóa form nếu lỗi', 'dùng màu đỏ làm thông báo duy nhất', 'tin validation phía client là đủ bảo mật'] },
    { topic: 'design token integration', practice: 'dùng semantic token có theme contract, tránh hardcode primitive theo component', evidence: 'token usage audit và theme visual regression', distractors: ['copy mã màu trực tiếp từ Figma', 'tạo token mới cho từng pixel khác biệt', 'ghi đè theme bằng important'] },
    { topic: 'frontend security', practice: 'escape theo output context, tránh unsafe HTML và giữ token nhạy cảm ngoài nơi script truy cập', evidence: 'CSP report, XSS test vector và storage audit', distractors: ['lọc chuỗi bằng cách xóa thẻ script', 'lưu access token dài hạn trong localStorage', 'tin dữ liệu vì đến từ API nội bộ'] },
    { topic: 'test strategy', practice: 'test hành vi ở boundary đúng cấp, ưu tiên contract/integration và một số E2E critical path', evidence: 'coverage theo risk và failure signal của test suite', distractors: ['snapshot toàn bộ DOM cho mọi component', 'mock toàn bộ dependency trong integration test', 'dùng phần trăm line coverage làm mục tiêu duy nhất'] },
    { topic: 'slot reel rendering và authoritative outcome', practice: 'render reel từ outcome server/RGS đã ký, giữ symbol stop và payline độc lập với FPS hoặc skip animation', evidence: 'outcome-to-reel deterministic replay trên nhiều FPS và thiết bị', distractors: ['random symbol cục bộ rồi gửi kết quả lên server', 'đổi reel stop khi frame bị drop', 'tính win từ DOM symbol đang hiển thị'] },
    { topic: 'bet slip odds-change UX', practice: 'hiển thị odds version, price change, suspended selection và yêu cầu xác nhận lại theo preference trước submit', evidence: 'race test giữa quote, accept và market suspension cùng accessibility audit', distractors: ['tự chấp nhận mọi odds mới để giảm lỗi', 'giữ odds cũ trên UI dù server đã reject', 'xóa toàn bet slip khi một selection suspend'] },
    { topic: 'table betting window UI', practice: 'lấy server clock làm chuẩn, biểu diễn OPEN/CLOSING/CLOSED và disable bet có acknowledgement rõ', evidence: 'clock-skew/latency test và round-state event trace', distractors: ['đếm ngược hoàn toàn bằng timer client', 'cho click sau zero rồi hy vọng server nhận', 'ẩn chip cược khi đang pending'] },
    { topic: 'card game hidden information UI', practice: 'tách private/public state, không log/cache hole card nhạy cảm và reveal đúng authorization/phase', evidence: 'network payload audit, spectator test và reconnect privacy test', distractors: ['gửi toàn deck cho client rồi dùng CSS ẩn', 'lưu hole card vào analytics event', 'reveal bài người fold khi animation kết thúc'] },
    { topic: 'crash cash-out interaction', practice: 'gửi cash-out idempotent một lần, hiển thị pending/accepted/rejected theo server timestamp và không giả định click là thắng', evidence: 'high-latency double-click test đối chiếu cash-out receipt và bust event', distractors: ['optimistic settle wallet ngay khi click', 'retry cash-out bằng ID mới liên tục', 'dùng thời điểm animation bust trên client để quyết định'] },
    { topic: 'real-money wallet presentation', practice: 'phân biệt available, reserved, bonus và withdrawable balance; mọi thay đổi gắn transaction receipt', evidence: 'UI-ledger reconciliation qua bet, win, rollback, bonus và reconnect', distractors: ['hiển thị một balance tổng duy nhất', 'tự cộng tiền thắng trước callback settlement', 'ẩn reserve để số dư trông cao hơn'] },
  ],
  BACKEND: [
    { topic: 'API contract', practice: 'version contract, validate tại boundary và trả lỗi ổn định có machine-readable code', evidence: 'schema contract test và compatibility matrix', distractors: ['đổi field trực tiếp vì client sẽ tự thích nghi', 'trả message exception nội bộ', 'coerce mọi input sai sang giá trị mặc định'] },
    { topic: 'transaction và consistency', practice: 'xác định invariant, transaction boundary và isolation phù hợp trước khi ghi nhiều thực thể', evidence: 'concurrency test và invariant assertion trong transaction', distractors: ['ghi lần lượt rồi rollback thủ công', 'dùng retry để thay transaction', 'khóa toàn database cho mọi cập nhật'] },
    { topic: 'idempotency', practice: 'dùng idempotency key có scope, lưu outcome canonical và xử lý concurrent duplicate', evidence: 'parallel retry test cùng unique constraint/receipt', distractors: ['so timestamp để đoán request trùng', 'tin client sẽ không retry', 'trừ reward trước rồi mới kiểm tra key'] },
    { topic: 'event-driven architecture', practice: 'định nghĩa event immutable, ownership, ordering expectation và consumer idempotent', evidence: 'event schema registry và replay test', distractors: ['dùng event như lệnh mutable', 'phụ thuộc tuyệt đối vào global ordering', 'cho mọi consumer cập nhật cùng aggregate'] },
    { topic: 'cache correctness', practice: 'chọn key, TTL và invalidation theo consistency requirement; chống stampede', evidence: 'cache hit/staleness metric và load test khi cold cache', distractors: ['cache mọi response với TTL dài', 'xóa toàn cache sau mỗi write', 'coi cache là source of truth'] },
    { topic: 'database indexing', practice: 'thiết kế index từ query pattern và cardinality, xác nhận bằng execution plan/write cost', evidence: 'EXPLAIN ANALYZE trước/sau và index usage metric', distractors: ['index mọi column để query nhanh', 'chỉ nhìn thời gian query trên dữ liệu nhỏ', 'dùng composite index không xét thứ tự cột'] },
    { topic: 'authorization', practice: 'kiểm tra quyền trên server theo resource/action và mặc định từ chối ở mọi đường truy cập', evidence: 'permission matrix và negative authorization test', distractors: ['ẩn nút trên client là đủ', 'kiểm tra role nhưng không kiểm tra resource ownership', 'cho phép mặc định nếu policy thiếu'] },
    { topic: 'resilience và timeout', practice: 'đặt timeout budget, bounded retry có jitter, circuit breaker và degradation rõ', evidence: 'failure-injection test và latency/error budget trace', distractors: ['retry vô hạn khi dependency lỗi', 'dùng cùng timeout dài cho mọi hop', 'catch exception rồi trả success rỗng'] },
    { topic: 'observability', practice: 'kết nối structured log, metric và trace bằng correlation ID, không ghi bí mật', evidence: 'trace xuyên service và alert gắn với SLO', distractors: ['log toàn bộ request body để dễ debug', 'chỉ theo dõi CPU server', 'alert trên mọi exception đơn lẻ'] },
    { topic: 'zero-downtime migration', practice: 'dùng expand-migrate-contract, backfill quan sát được và giữ tương thích trong giai đoạn chuyển tiếp', evidence: 'migration rehearsal, rollback plan và compatibility test hai version', distractors: ['rename/drop column trong một deploy', 'chạy backfill lớn trong transaction duy nhất', 'deploy app mới trước khi schema hỗ trợ'] },
    { topic: 'RGS slot outcome và RNG boundary', practice: 'tách certified RNG/game math khỏi presentation, version game config bất biến và lưu outcome đủ để audit/replay', evidence: 'RNG request/outcome log, game-version hash và lab-certified math artifact', distractors: ['cho client chọn seed quyết định outcome', 'sửa paytable đang live mà giữ cùng version', 'chỉ lưu số tiền win không lưu symbol outcome'] },
    { topic: 'sportsbook bet acceptance và exposure', practice: 'quote odds có version/expiry, atomically kiểm limit-exposure-market state rồi phát bet receipt canonical', evidence: 'concurrent acceptance test và liability ledger theo market/selection', distractors: ['trừ ví trước rồi mới kiểm market suspend', 'tin odds và payout client gửi lên', 'accept bet rồi cập nhật limit bất đồng bộ'] },
    { topic: 'table/card settlement engine', practice: 'dùng authoritative round/hand state, rule version và idempotent settlement hỗ trợ rollback/correction có ledger bù', evidence: 'golden hand/round suite cùng duplicate/out-of-order callback test', distractors: ['update balance trực tiếp khi dealer UI báo kết quả', 'xóa settlement cũ khi correction', 'tạo payout từ label cửa cược phía client'] },
    { topic: 'crash concurrent cash-out arbitration', practice: 'so cash-out với bust bằng monotonic authoritative ordering, khóa round state và trả receipt idempotent', evidence: 'deterministic race test tại cùng millisecond cùng event sequence/ledger', distractors: ['ưu tiên request nào đến database trước không timestamp authority', 'dựa vào thời gian click do client gửi', 'settle cả hai khi callback bị duplicate'] },
    { topic: 'wallet double-entry và reconciliation', practice: 'ghi debit/credit cân bằng cho reserve, settle, release, rollback; không mutate lịch sử và reconcile với provider', evidence: 'balanced journal invariant, external reconciliation report và correction chain', distractors: ['chỉ cập nhật cột balance hiện tại', 'xóa bet transaction khi rollback', 'dùng floating point cho monetary amount'] },
    { topic: 'bonus, KYC/AML và self-exclusion enforcement', practice: 'áp policy tại centralized authorization boundary trước wager/deposit/withdrawal, phát audit event và fail closed', evidence: 'policy decision log và negative test xuyên mọi channel/provider', distractors: ['chỉ ẩn game ở frontend', 'kiểm self-exclusion sau settlement', 'cho aggregator tự quyết toàn bộ compliance'] },
  ],
  QA: [
    { topic: 'risk-based testing', practice: 'ưu tiên theo impact, likelihood, detectability và vùng thay đổi thay vì chia đều effort', evidence: 'risk matrix liên kết test coverage và residual risk', distractors: ['chạy mọi test case với cùng ưu tiên', 'chỉ test ticket vừa thay đổi', 'ưu tiên theo số dòng code'] },
    { topic: 'test design techniques', practice: 'kết hợp equivalence partition, boundary value và decision table theo rule', evidence: 'test model cho thấy partition/boundary/rule coverage', distractors: ['chọn input ngẫu nhiên thật nhiều', 'chỉ test happy path và null', 'mỗi requirement viết đúng một test'] },
    { topic: 'state-transition testing', practice: 'lập model state/event/guard và kiểm tra transition hợp lệ lẫn bị cấm', evidence: 'state table với transition coverage', distractors: ['test từng màn hình độc lập', 'chỉ kiểm tra trạng thái cuối', 'bỏ qua event lặp vì đã test một lần'] },
    { topic: 'concurrency testing', practice: 'tạo interleaving có kiểm soát, barrier và invariant assertion thay vì chỉ tăng load', evidence: 'repro script deterministic và transaction/event trace', distractors: ['click thật nhanh bằng tay', 'chạy load test rồi tìm lỗi trong log', 'thêm sleep ngẫu nhiên để tạo race'] },
    { topic: 'network resilience testing', practice: 'mô phỏng latency, loss, reorder, offline/reconnect và xác minh state convergence', evidence: 'network profile cùng before/after state digest', distractors: ['chỉ ngắt mạng rồi mở lại', 'coi reconnect thành login mới', 'test trên Wi-Fi nhanh là đủ'] },
    { topic: 'regression selection', practice: 'truy vết dependency, contract và data flow để chọn impacted suite cùng smoke critical path', evidence: 'change-impact map và pass/fail theo affected area', distractors: ['chạy lại đúng test từng fail', 'luôn chạy full suite dù quá thời gian', 'chọn test theo tên file giống ticket'] },
    { topic: 'defect reporting', practice: 'ghi môi trường, build, dữ liệu, bước tối thiểu, actual/expected và evidence có thể tái hiện', evidence: 'clean-environment reproduction và artifact/log timestamp', distractors: ['ghi severity cao để được ưu tiên', 'đính video nhưng không có bước tái hiện', 'mô tả nguyên nhân khi chưa có bằng chứng'] },
    { topic: 'performance testing', practice: 'đặt workload model, percentile/SLO và monitor resource saturation lẫn correctness', evidence: 'load profile, p95/p99, error rate và saturation chart', distractors: ['chỉ báo request/second cao nhất', 'test trên một payload nhỏ', 'bỏ qua lỗi chức năng khi latency đạt mục tiêu'] },
    { topic: 'security testing', practice: 'kiểm tra threat-based negative path, privilege boundary và dữ liệu nhạy cảm', evidence: 'abuse-case suite và authorization audit trail', distractors: ['chỉ chạy scanner mặc định', 'thử SQL injection trên mọi field rồi kết thúc', 'coi staging không cần bảo vệ dữ liệu'] },
    { topic: 'flaky test diagnosis', practice: 'phân loại nondeterminism theo time/order/data/environment và sửa root cause có telemetry', evidence: 'repeatable seed, quarantine record và failure distribution', distractors: ['retry test đến khi pass', 'tăng timeout gấp đôi', 'xóa test vì không ổn định'] },
    { topic: 'slot math verification', practice: 'đối chiếu PAR sheet với implementation bằng exhaustive/simulation test cho RTP, hit rate, feature frequency và max win', evidence: 'seeded simulation report có confidence interval và contribution theo feature', distractors: ['spin thủ công đến khi thấy jackpot', 'pass nếu RTP ngắn hạn gần target', 'chỉ kiểm payout của base game'] },
    { topic: 'betting odds và settlement QA', practice: 'test odds version, suspend/resume, dead heat, void, partial settlement, cash-out và rule theo sport/market', evidence: 'market scenario matrix đối chiếu rulebook và canonical receipt', distractors: ['chỉ test thắng/thua thông thường', 'dùng feed production làm expected result', 'coi mọi market settle giống moneyline'] },
    { topic: 'table betting rule coverage', practice: 'dùng decision table cho chip limit, betting window, main/side bet, result, payout và correction theo jurisdiction', evidence: 'rule-to-test traceability cho Baccarat, Roulette, Blackjack và live round', distractors: ['test mỗi cửa cược một lần', 'bỏ boundary min/max bet', 'coi video dealer là source of truth duy nhất'] },
    { topic: 'card game combinatorial QA', practice: 'sinh hand có kiểm soát cho ranking, tie, all-in, side pot, split/double và action legality qua mọi state', evidence: 'property-based/golden hand suite cùng replay seed', distractors: ['chơi thủ công nhiều ván ngẫu nhiên', 'chỉ test royal flush và high card', 'mock bỏ pot calculation trong integration test'] },
    { topic: 'crash boundary và provably-fair QA', practice: 'verify seed commitment/reveal, nonce, distribution và race cash-out trước/đúng/sau bust dưới clock skew/latency', evidence: 'independent verifier cùng deterministic boundary-run report', distractors: ['chỉ so multiplier hiển thị với payout', 'dùng client clock làm oracle', 'bỏ qua round có multiplier cực cao vì hiếm'] },
    { topic: 'wallet, bonus và compliance regression', practice: 'test invariant tiền qua reserve-settle-rollback, wagering contribution, limit, self-exclusion, KYC/AML hold và duplicate callback', evidence: 'end-to-end ledger reconciliation cùng policy audit trail', distractors: ['chỉ assert số dư cuối', 'reset database giữa từng callback nên không thấy duplicate', 'bỏ test compliance khỏi smoke suite'] },
  ],
  QC: [
    { topic: 'quality gate design', practice: 'định nghĩa tiêu chí đo được, owner, evidence và disposition cho từng gate', evidence: 'gate matrix có pass/fail/block/waiver rõ ràng', distractors: ['dùng checklist chung cho mọi deliverable', 'cho reviewer tự quyết tiêu chí lúc duyệt', 'đếm số mục đã tick làm chất lượng'] },
    { topic: 'evidence integrity', practice: 'ràng buộc evidence với build, config, timestamp và test case cụ thể', evidence: 'immutable artifact link cùng build hash và run ID', distractors: ['chấp nhận screenshot không có build ID', 'dùng tin nhắn xác nhận làm evidence chính', 'tái sử dụng evidence của build trước'] },
    { topic: 'sampling plan', practice: 'chọn sampling theo risk, lot size và acceptable quality level, tăng cường khi có tín hiệu xấu', evidence: 'sampling rationale và defect distribution theo lot', distractors: ['luôn kiểm 10% bất kể rủi ro', 'chọn mẫu dễ truy cập nhất', 'pass cả lot nếu mẫu đầu tiên đạt'] },
    { topic: 'specification traceability', practice: 'liên kết requirement-version với acceptance, deliverable và evidence hai chiều', evidence: 'traceability matrix không có orphan requirement', distractors: ['duyệt theo bản spec nhớ gần nhất', 'chỉ link ticket tổng', 'coi file mới nhất là bản được phê duyệt'] },
    { topic: 'nonconformity handling', practice: 'ghi mức độ, containment, owner, root cause và verification of effectiveness', evidence: 'NCR/CAPA record với retest độc lập', distractors: ['sửa file rồi đóng issue ngay', 'hạ severity để kịp release', 'gộp mọi lỗi tương tự mà không xác minh'] },
    { topic: 'change control', practice: 'đánh giá impact, approval và version baseline trước khi thay đổi deliverable đã duyệt', evidence: 'change request cùng diff, approver và baseline mới', distractors: ['sửa trực tiếp vì thay đổi nhỏ', 'chỉ báo qua chat sau khi sửa', 'giữ tên version cũ để tránh cập nhật link'] },
    { topic: 'release readiness', practice: 'tổng hợp residual risk, blocker, rollback, monitoring và sign-off có thẩm quyền', evidence: 'release dossier liên kết gate status và waiver', distractors: ['dựa vào số bug còn mở', 'pass vì deadline không thể lùi', 'coi build thành công là release-ready'] },
    { topic: 'measurement system', practice: 'xác nhận định nghĩa metric, cách đo, độ lặp lại và nguồn dữ liệu trước khi kết luận', evidence: 'measurement procedure cùng reproducibility check', distractors: ['so số từ hai dashboard khác định nghĩa', 'làm tròn để kết quả dễ đọc', 'loại outlier không ghi lý do'] },
    { topic: 'supplier/third-party quality', practice: 'quy định acceptance contract, provenance và kiểm tra đầu vào theo criticality', evidence: 'supplier scorecard, certificate và incoming inspection', distractors: ['tin package vì vendor uy tín', 'chỉ kiểm checksum file', 'đợi lỗi production rồi yêu cầu bồi thường'] },
    { topic: 'audit independence', practice: 'tách người tạo khỏi người phê duyệt ở hạng mục rủi ro và lưu audit trail bất biến', evidence: 'review history thể hiện segregation of duties', distractors: ['cho tác giả tự duyệt khi gấp', 'xóa comment cũ sau khi đã sửa', 'chỉ lưu trạng thái cuối cùng'] },
    { topic: 'iGaming math certification package', practice: 'baseline source, executable, RNG interface, PAR/paytable và simulation evidence cùng một version hash trước khi gửi lab', evidence: 'submission manifest tái tạo được certified build và math result', distractors: ['gửi build mới nhất và spreadsheet cũ', 'chỉ nộp screenshot RTP', 'sửa cosmetic rồi giữ nguyên hash certification'] },
    { topic: 'slot release quality gate', practice: 'gate theo certified RTP/config, symbol-paytable mapping, max win, feature rules, localization và responsible-gambling requirement', evidence: 'signed release matrix trace từ game version tới lab report và production config', distractors: ['pass nếu smoke spin không lỗi', 'cho phép đổi reel strip sau QC', 'kiểm RTP bằng session chơi ngắn'] },
    { topic: 'betting/table rulebook control', practice: 'version rulebook, payout/odds precision, void/correction và jurisdiction override; mọi settlement phải trace đúng version', evidence: 'rule-version matrix cùng golden settlement receipt', distractors: ['dùng một rulebook cho mọi thị trường', 'sửa rule trực tiếp sau tranh chấp', 'coi provider result là đủ thay acceptance rule'] },
    { topic: 'card/crash fairness audit', practice: 'đối chiếu shuffle/RNG hoặc seed commitment với implementation, log bất biến và verifier độc lập', evidence: 'seed/replay sample, verifier output và chain-of-custody artifact', distractors: ['tin chứng nhận RNG chung của vendor', 'chỉ xem distribution dashboard', 'cho team phát triển tự ký toàn bộ fairness review'] },
    { topic: 'wallet reconciliation quality gate', practice: 'yêu cầu journal cân bằng, provider reconciliation, orphan/duplicate detection và correction không xóa lịch sử', evidence: 'zero-difference reconciliation hoặc waiver có owner/threshold rõ', distractors: ['so tổng balance đầu-cuối', 'bỏ qua chênh lệch nhỏ hàng ngày', 'sửa trực tiếp ledger để dashboard khớp'] },
    { topic: 'compliance evidence: RG, KYC và AML', practice: 'trace control tới jurisdiction, test evidence, policy version, access log và retention; blocker nếu self-exclusion có thể bypass', evidence: 'control matrix cùng negative-path run và immutable audit record', distractors: ['pass theo cam kết của product owner', 'chỉ kiểm happy-path KYC', 'để RG warning là cosmetic issue'] },
  ],
  PM: [
    { topic: 'scope và outcome', practice: 'chốt outcome, non-goal, acceptance và change path trước khi phân rã công việc', evidence: 'scope baseline liên kết outcome metric và acceptance', distractors: ['bắt đầu từ danh sách task team đề xuất', 'coi mọi yêu cầu stakeholder đều cùng ưu tiên', 'để non-goal ngầm hiểu'] },
    { topic: 'dependency management', practice: 'lập dependency network, critical path, interface date và owner cho mỗi handoff', evidence: 'dependency map có lead time và trạng thái interface', distractors: ['chỉ ghi blocker khi nó xảy ra', 'xếp mọi task chạy song song', 'theo dõi dependency bằng deadline cuối'] },
    { topic: 'capacity planning', practice: 'dùng availability thực, historical throughput và buffer cho unplanned work', evidence: 'capacity model so forecast với actual theo sprint', distractors: ['lập kế hoạch 100% thời gian khả dụng', 'đổi story point trực tiếp thành giờ', 'tăng capacity bằng cách thêm task'] },
    { topic: 'risk management', practice: 'ghi trigger, probability, impact, response, contingency và owner; review định kỳ', evidence: 'risk register có exposure trend và trigger status', distractors: ['chỉ liệt kê vấn đề đã xảy ra', 'gắn mọi risk cho PM làm owner', 'đóng risk khi đã có mitigation plan'] },
    { topic: 'estimation', practice: 'ước lượng theo range và uncertainty, tách effort khỏi duration, cập nhật khi có evidence', evidence: 'estimate history, confidence range và calibration', distractors: ['cam kết bằng con số trung bình duy nhất', 'cộng buffer 20% cho mọi task', 'dùng estimate như KPI cá nhân'] },
    { topic: 'prioritization', practice: 'so giá trị, urgency, risk reduction và cost of delay theo constraint chiến lược', evidence: 'decision log với tiêu chí và opportunity cost', distractors: ['ưu tiên người yêu cầu chức vụ cao nhất', 'làm việc ngắn nhất trước', 'giữ mọi item ở mức ưu tiên cao'] },
    { topic: 'stakeholder alignment', practice: 'xác định decision rights, cadence và format thông tin theo nhu cầu từng bên', evidence: 'RACI/DACI cùng decision log được xác nhận', distractors: ['mời mọi stakeholder vào mọi cuộc họp', 'gửi cùng một báo cáo chi tiết cho tất cả', 'trì hoãn quyết định tới khi đồng thuận tuyệt đối'] },
    { topic: 'delivery forecasting', practice: 'dùng throughput/cycle-time distribution và Monte Carlo thay vì ngày chắc chắn giả tạo', evidence: 'forecast percentile và actual calibration chart', distractors: ['lấy tổng point chia velocity trung bình', 'cam kết theo best-case', 'đổi estimate để khớp deadline'] },
    { topic: 'incident coordination', practice: 'thiết lập incident command, channel, update cadence và tách mitigation khỏi root-cause', evidence: 'timeline quyết định cùng owner và status update', distractors: ['để nhiều người cùng chỉ huy', 'tìm người gây lỗi trước khi giảm impact', 'im lặng tới khi có nguyên nhân chắc chắn'] },
    { topic: 'continuous improvement', practice: 'chọn một thay đổi có owner và success measure từ retrospective, theo dõi đến vòng sau', evidence: 'action experiment với baseline và follow-up result', distractors: ['ghi nhiều lesson learned nhưng không owner', 'đổi toàn bộ quy trình sau một sprint xấu', 'dùng retrospective để đánh giá cá nhân'] },
    { topic: 'iGaming product portfolio planning', practice: 'lập roadmap theo market/jurisdiction, certification lead time, provider dependency và outcome thay vì chỉ số lượng game', evidence: 'portfolio map nối revenue hypothesis, compliance gate và capacity', distractors: ['ưu tiên game có GGR cao nhất ở thị trường khác', 'đặt cùng launch date cho mọi jurisdiction', 'đếm số title release làm outcome chính'] },
    { topic: 'slot math-art-engine dependency', practice: 'khóa interface giữa math model, reel/paytable, asset/animation và RGS version với change-control rõ', evidence: 'integrated milestone plan cùng certified-config dependency graph', distractors: ['cho art và math chốt độc lập rồi ghép cuối', 'đổi paytable như copy change', 'để engine team tự suy ra feature rule'] },
    { topic: 'sportsbook/live table launch coordination', practice: 'lập readiness cho feed, trading/risk, dealer/provider, betting window, settlement rule, wallet và incident ownership', evidence: 'end-to-end rehearsal cùng go/no-go checklist và escalation path', distractors: ['go-live khi frontend đã hoàn tất', 'giao toàn incident cho provider', 'coi feed uptime là readiness duy nhất'] },
    { topic: 'card/crash risk delivery', practice: 'đưa fairness, concurrency, reconnect, cash-out boundary và independent certification vào critical path', evidence: 'risk burndown cùng deterministic replay/certification milestone', distractors: ['để edge case cho hardening sprint cuối', 'xử lý fairness sau soft launch', 'coi concurrency là việc riêng backend không ảnh hưởng lịch'] },
    { topic: 'bonus và promotion governance', practice: 'phê duyệt mechanic theo unit economics, wagering contribution, abuse vector, RG guardrail và jurisdiction trước launch', evidence: 'promotion P&L scenario, abuse test và compliance sign-off', distractors: ['launch nhanh rồi chỉnh nếu bonus cost cao', 'chỉ theo dõi số người claim', 'đẩy wagering requirement cao để giảm cost'] },
    { topic: 'GGR/NGR và harm-aware prioritization', practice: 'đánh giá GGR cùng bonus/tax/provider cost, retention quality, complaint và harm indicator; đặt guardrail trước experiment', evidence: 'metric tree có NGR, cohort value và responsible-gambling guardrail', distractors: ['tối ưu GGR ngắn hạn làm north-star duy nhất', 'loại self-excluded player khỏi phân tích harm', 'dừng experiment khi revenue vừa tăng'] },
  ],
  HR: [
    { topic: 'structured hiring', practice: 'xây competency rubric, câu hỏi hành vi nhất quán và đánh giá độc lập trước debrief', evidence: 'scorecard có behavioral anchor và inter-rater review', distractors: ['tùy biến tiêu chí theo từng ứng viên', 'ưu tiên cảm giác culture fit', 'thảo luận chung trước khi chấm điểm'] },
    { topic: 'onboarding design', practice: 'thiết kế mốc 30/60/90 ngày theo outcome, access, context, buddy và feedback loop', evidence: 'time-to-productivity cùng milestone completion và pulse feedback', distractors: ['gửi thật nhiều tài liệu trong ngày đầu', 'giao ngay dự án lớn để học nhanh', 'coi hoàn tất checklist là onboarding thành công'] },
    { topic: 'performance enablement', practice: 'đặt kỳ vọng quan sát được, check-in thường xuyên và phân biệt skill, will, system constraint', evidence: 'goal/evidence log cùng support action và follow-up', distractors: ['đợi kỳ review mới phản hồi', 'so sánh nhân viên với nhau', 'coi mọi kết quả thấp là thiếu nỗ lực'] },
    { topic: 'learning development', practice: 'phân tích capability gap, thiết kế practice trong công việc và đo transfer chứ không chỉ attendance', evidence: 'pre/post behavior evidence và business outcome liên quan', distractors: ['mua khóa học phổ biến cho cả team', 'đếm giờ học làm KPI chính', 'coi quiz cuối khóa là đủ chứng minh năng lực'] },
    { topic: 'employee relations', practice: 'lắng nghe trung lập, ghi fact, giữ confidentiality theo need-to-know và theo quy trình công bằng', evidence: 'case log có timeline, source và action rationale', distractors: ['hứa giữ bí mật tuyệt đối trước khi biết vụ việc', 'kết luận dựa trên lời kể đầu tiên', 'giải quyết không ghi chép để bảo vệ riêng tư'] },
    { topic: 'compensation fairness', practice: 'dùng job architecture, market range và equity analysis; tách pay decision khỏi bias cá nhân', evidence: 'pay-band rationale và adjusted gap analysis', distractors: ['trả theo mức lương cũ của ứng viên', 'đàm phán từng trường hợp không có range', 'chỉ so mức trung bình toàn công ty'] },
    { topic: 'engagement measurement', practice: 'kết hợp survey bảo mật với qualitative follow-up, phân đoạn đủ lớn và đóng feedback loop', evidence: 'response/driver analysis cùng action update cho nhân viên', distractors: ['xem engagement score là KPI của manager', 'công bố dữ liệu nhóm quá nhỏ', 'khảo sát liên tục nhưng không phản hồi hành động'] },
    { topic: 'workforce planning', practice: 'mô hình hóa demand capability, supply, attrition và nhiều kịch bản build-buy-borrow', evidence: 'scenario plan với leading indicator và capacity gap', distractors: ['dùng headcount năm trước cộng tăng trưởng', 'tuyển ngay khi team báo quá tải', 'coi mọi role có thể thay thế theo số lượng'] },
    { topic: 'psychological safety', practice: 'thiết kế cơ chế lên tiếng, phản hồi không trừng phạt và xử lý hành vi vi phạm nhất quán', evidence: 'speak-up pattern, response time và follow-through không lộ danh tính', distractors: ['tổ chức team building để tăng an toàn', 'yêu cầu mọi người phát biểu trong họp lớn', 'coi không có complaint là môi trường an toàn'] },
    { topic: 'people data privacy', practice: 'thu thập tối thiểu, giới hạn mục đích/quyền truy cập, retention và consent phù hợp', evidence: 'data inventory, access audit và deletion/retention record', distractors: ['lưu mọi dữ liệu phòng khi cần', 'chia sẻ dashboard cá nhân cho manager mặc định', 'ẩn tên là đủ để dữ liệu không còn nhạy cảm'] },
    { topic: 'iGaming competency framework', practice: 'định nghĩa năng lực theo role gồm game math/RNG, betting rule, wallet, compliance và responsible gambling với behavioral anchor', evidence: 'career matrix có assessment evidence theo level và discipline', distractors: ['dùng competency game studio chung cho mọi vị trí', 'đánh giá kiến thức bằng số năm trong ngành', 'chỉ tuyển người từng làm đúng một sản phẩm'] },
    { topic: 'regulated-role onboarding', practice: 'onboard quyền truy cập theo least privilege, training AML/RG/data handling, rulebook và incident escalation trước production access', evidence: 'role-based completion, access approval và knowledge verification', distractors: ['cấp production access ngày đầu để học nhanh', 'dùng một khóa compliance cho mọi jurisdiction', 'coi ký policy là đã hiểu quy trình'] },
    { topic: 'trading, risk và fraud hiring', practice: 'dùng scenario có odds/exposure, bonus abuse, AML red flag và decision ethics; chấm theo rubric độc lập', evidence: 'work-sample scorecard và adverse-impact review', distractors: ['hỏi ứng viên dự đoán kết quả trận đấu', 'đánh giá theo lợi nhuận ở công ty cũ', 'ưu tiên người sẵn sàng bỏ qua rule khi khẩn cấp'] },
    { topic: 'responsible-gambling culture', practice: 'gắn RG vào mục tiêu, speak-up và escalation; bảo vệ người báo rủi ro dù xung đột revenue', evidence: 'training transfer, escalation outcome và survey psychological safety', distractors: ['để compliance tự chịu trách nhiệm RG', 'thưởng team chỉ theo GGR', 'xem cảnh báo harm là cản trở kinh doanh'] },
    { topic: 'shift và fatigue cho live casino/risk operations', practice: 'thiết kế ca, handover, break và four-eyes control cho quyết định tài chính/rủi ro cao', evidence: 'fatigue risk assessment, handover quality và error pattern theo ca', distractors: ['tăng overtime trong event lớn', 'để một người vừa thao tác vừa phê duyệt', 'đo hiệu suất bằng số round/case xử lý'] },
    { topic: 'background check và segregation of duties', practice: 'áp kiểm tra phù hợp pháp luật, conflict disclosure và tách quyền tạo game config, approve, deploy, settle/refund', evidence: 'role-risk matrix, access review và exception approval có thời hạn', distractors: ['kiểm tra sâu mọi nhân viên bất kể role', 'cho lead giữ mọi quyền để xử lý nhanh', 'coi NDA thay thế access governance'] },
  ],
}

const rankDifficulty: Record<WorkRankId, WorkDifficulty> = {
  INTERN: 1,
  APPRENTICE: 2,
  JUNIOR: 3,
  SPECIALIST: 4,
  SENIOR: 5,
  LEAD: 6,
}

const difficultyNames = ['Nền tảng', 'Thực hành', 'Phân tích', 'Tích hợp', 'Chuyên gia', 'Lãnh đạo'] as const

const careerTeamNames: Record<WorkCareerId, string> = {
  ART: 'Art',
  ANIMATION: 'Animation',
  GAME_DESIGN: 'Game Design',
  FRONTEND: 'Frontend',
  BACKEND: 'Backend',
  QA: 'QA',
  QC: 'QC',
  PM: 'PM',
  HR: 'HR',
}

const promptFor = (difficulty: WorkDifficulty, careerId: WorkCareerId, topic: string, context: string): string => {
  const team = careerTeamNames[careerId]
  switch (difficulty) {
    case 1: return `Vấn đề: ${context}. Nhóm ${team} đang phụ trách “${topic}”. Cách xử lý nào phù hợp nhất?`
    case 2: return `Vấn đề: ${context}. Nhóm ${team} vừa nhận việc “${topic}”. Việc đầu tiên nên làm là gì?`
    case 3: return `Vấn đề: ${context}. Nhóm ${team} thấy “${topic}” có dấu hiệu sai. Nên kiểm tra và xử lý thế nào?`
    case 4: return `Vấn đề: ${context}. Việc “${topic}” phải bàn giao qua nhiều nhóm. Cách nào giúp phối hợp và giảm rủi ro?`
    case 5: return `Vấn đề: ${context}. Deadline gấp khiến nhóm ${team} phải cân nhắc khi xử lý “${topic}”. Phương án nào hợp lý và có thể giải thích được?`
    case 6: return `Vấn đề: ${context}. Bạn là lead nhóm ${team}, chịu trách nhiệm về “${topic}”. Cách nào vừa xử lý lỗi hiện tại vừa ngăn lỗi lặp lại?`
  }
}

function escapeSvg(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[character] || character))
}

function makeQuestionVisual(careerId: WorkCareerId, topic: string, context: string, contextIndex: number): WorkChallengeImage | undefined {
  if (contextIndex < 18) return undefined
  const lower = context.toLowerCase()
  const kind = lower.includes('slot') ? 'SLOT' : lower.includes('sportsbook') || lower.includes('odds') ? 'BETTING' : lower.includes('table') || lower.includes('baccarat') || lower.includes('blackjack') ? 'TABLE' : lower.includes('card') || lower.includes('poker') ? 'CARD' : lower.includes('crash') ? 'CRASH' : lower.includes('wallet') || lower.includes('bonus') || lower.includes('kyc') || lower.includes('self-exclude') ? 'LEDGER' : 'AUDIT'
  const palette: Record<string, [string, string]> = { SLOT: ['#c8f267', '#21342d'], BETTING: ['#78d8ff', '#172b3d'], TABLE: ['#ffb86c', '#3d2b1d'], CARD: ['#ae91ff', '#28203e'], CRASH: ['#ff91c8', '#3d2038'], LEDGER: ['#6fe0b0', '#18352f'], AUDIT: ['#dce8cf', '#26352c'] }
  const [accent, panel] = palette[kind]
  const labels: Record<string, string[]> = {
    SLOT: ['RTP 96.2%', 'VOLATILITY HIGH', 'MAX WIN 5,000x', 'FREE SPIN'],
    BETTING: ['ODDS 1.85', 'MARKET OPEN', 'STAKE 100', 'EXPIRY 12s'],
    TABLE: ['BETTING OPEN', 'MAIN BET', 'SIDE BET', 'SETTLED'],
    CARD: ['POT 1,200', 'TURN: P3', 'SIDE POT 400', 'PRIVATE CARD'],
    CRASH: ['1.00x', '2.40x', '4.85x', 'BUST'],
    LEDGER: ['RESERVE', 'DEBIT', 'CREDIT', 'RECONCILE'],
    AUDIT: ['BUILD HASH', 'RULE VERSION', 'EVIDENCE', 'PASS / BLOCK'],
  }
  const chips = labels[kind].map((label, index) => `<rect x="${18 + index * 88}" y="67" width="78" height="25" rx="4" fill="${index === labels[kind].length - 1 ? accent : '#ffffff18'}"/><text x="${57 + index * 88}" y="83" text-anchor="middle" fill="${index === labels[kind].length - 1 ? panel : '#dce8cf'}" font-size="7" font-family="monospace">${escapeSvg(label)}</text>`).join('')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="112" viewBox="0 0 380 112"><rect width="380" height="112" rx="8" fill="${panel}"/><rect x="10" y="10" width="360" height="22" rx="4" fill="${accent}22"/><circle cx="22" cy="21" r="4" fill="${accent}"/><text x="34" y="24" fill="${accent}" font-size="8" font-family="monospace">${escapeSvg(kind)} · ${escapeSvg(careerId)} · DECISION SNAPSHOT</text><text x="18" y="50" fill="#edf7e8" font-size="8" font-family="monospace">${escapeSvg(topic.slice(0, 52))}</text>${chips}</svg>`
  return { src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`, alt: `Sơ đồ trực quan ${kind} cho chủ đề ${topic}`, caption: 'Đọc các trạng thái từ trái sang phải, sau đó chọn cách xử lý đúng.' }
}

export function difficultyForRank(rank: WorkRankId): WorkDifficulty {
  return rankDifficulty[rank]
}

export function difficultyLabel(difficulty: WorkDifficulty): string {
  return difficultyNames[difficulty - 1]
}

const bankCache: Partial<Record<WorkCareerId, WorkBankQuestion[]>> = {}

export function buildCareerQuestionBank(careerId: WorkCareerId): WorkBankQuestion[] {
  const cached = bankCache[careerId]
  if (cached) return cached
  const careerAreas = areas[careerId]
  const questions: WorkBankQuestion[] = []
  for (let difficulty = 1 as WorkDifficulty; difficulty <= 6; difficulty = (difficulty + 1) as WorkDifficulty) {
    careerAreas.forEach((area, areaIndex) => {
      contexts.forEach((context, contextIndex) => {
        const answerId = `correct-${areaIndex}`
        const image = makeQuestionVisual(careerId, area.topic, context, contextIndex)
        questions.push({
          id: `${careerId.toLowerCase()}-${difficulty}-${areaIndex + 1}-${contextIndex + 1}`,
          careerId,
          difficulty,
          topic: area.topic,
          title: `${difficultyNames[difficulty - 1]} · ${area.topic}`,
          prompt: promptFor(difficulty, careerId, area.topic, context),
          options: [
            { id: answerId, label: area.practice, detail: `Evidence: ${area.evidence}` },
            { id: `d1-${areaIndex}`, label: area.distractors[0] },
            { id: `d2-${areaIndex}`, label: area.distractors[1] },
            { id: `d3-${areaIndex}`, label: area.distractors[2] },
          ],
          answer: answerId,
          image,
        })
      })
    })
  }
  bankCache[careerId] = questions
  return questions
}

export function careerQuestionBankSize(careerId: WorkCareerId): number {
  return areas[careerId].length * contexts.length * 6
}

export const workCareerQuestionBankSizes = (Object.keys(areas) as WorkCareerId[]).reduce((result, careerId) => {
  result[careerId] = careerQuestionBankSize(careerId)
  return result
}, {} as Record<WorkCareerId, number>)
