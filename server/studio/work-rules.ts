import { WorkActionRecord, WorkCareerId, WorkChallengeOption, WorkChallengePublic, WorkChallengeStep, WorkGrade, WorkJobDefinition, WorkRankId, WorkSessionMode } from '../../types/Work'
import { workCareerDefinition, workEconomy, workJobDefinition, workRankDefinitions } from './work-config'
import { buildCareerQuestionBank, careerQuestionBankSize, difficultyForRank, difficultyLabel } from './work-question-bank'

export interface WorkChallengeInternal {
  publicChallenge: WorkChallengePublic
  solutionByStep: Record<string, string>
}

export interface WorkScoreResult {
  score: number
  grade: WorkGrade
  accuracy: number
  speed: number
  completion: number
  answeredSteps: number
}

interface TemplateStep {
  id: string
  title: string
  prompt: string
  options: WorkChallengeOption[]
  answer: string
}

interface ChallengeTemplate {
  title: string
  instruction: string
  steps: TemplateStep[]
}

function hashSeed(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function rotate<T>(items: T[], offset: number): T[] {
  if (!items.length) return items
  const normalized = ((offset % items.length) + items.length) % items.length
  return [...items.slice(normalized), ...items.slice(0, normalized)]
}

function options(...items: Array<[string, string, string?]>): WorkChallengeOption[] {
  return items.map(([id, label, detail]) => ({ id, label, detail }))
}

function jobTemplate(jobId: string): ChallengeTemplate {
  switch (jobId) {
    case 'INBOX_TRIAGE':
      return {
        title: 'Inbox Triage',
        instruction: 'Đọc vấn đề, xác định team phù hợp rồi đưa request vào đúng lane.',
        steps: [
          { id: 'inbox-1', title: 'Request 01', prompt: 'Vấn đề: Sau khi người chơi reconnect, nút Bắt đầu bị đứng nên họ không thể vào lại ván. Team nào nên nhận request này trước?', options: options(['BUG', 'QA / Bug runtime'], ['DESIGN', 'Game Design / luồng chơi'], ['PM', 'PM / planning'], ['ART', 'Art / hình ảnh']), answer: 'BUG' },
          { id: 'inbox-2', title: 'Request 02', prompt: 'Vấn đề: Avatar đã hiển thị nhưng cần thêm một vòng màu mới. Team nào phụ trách chỉnh phần hình ảnh này?', options: options(['ART', 'Art / hình ảnh'], ['BACKEND', 'Backend / server'], ['QA', 'QA / kiểm thử'], ['HR', 'HR / nhân sự']), answer: 'ART' },
          { id: 'inbox-3', title: 'Request 03', prompt: 'Vấn đề: Người chơi mới không biết phải làm gì ở bước đầu. Team nào nên xem lại luật và luồng hướng dẫn?', options: options(['DESIGN', 'Game Design / luồng chơi'], ['QC', 'QC / chất lượng'], ['ANIMATION', 'Animation / chuyển động'], ['PM', 'PM / kế hoạch']), answer: 'DESIGN' },
          { id: 'inbox-4', title: 'Request 04', prompt: 'Vấn đề: Bản build đã sửa lỗi nhưng chưa có ảnh hoặc bằng chứng để xác nhận. Team nào nên kiểm tra việc này trước khi release?', options: options(['QC', 'QC / kiểm tra bằng chứng'], ['ART', 'Art / hình ảnh'], ['HR', 'HR / nhân sự'], ['FRONTEND', 'Frontend / giao diện']), answer: 'QC' },
        ],
      }
    case 'PALETTE_MATCH':
    case 'ASSET_COMPOSITION':
    case 'ASSET_DELIVERY':
      return {
        title: jobId === 'PALETTE_MATCH' ? 'Palette Match' : jobId === 'ASSET_COMPOSITION' ? 'Asset Composition' : 'Asset Delivery',
        instruction: 'Đọc tình huống hình ảnh rồi chọn phương án giúp sản phẩm dễ nhìn và dễ bàn giao.',
        steps: [
          { id: 'art-1', title: 'Màu chính', prompt: 'Vấn đề: Nền màn chơi khá tối và nhân vật bị chìm. Team Art nên chọn hướng màu nào để nhân vật vẫn dễ thấy?', options: options(['NEON_NIGHT', 'Nền xanh tím + điểm nhấn xanh mint'], ['SUNSET', 'Phủ cam + hồng lên mọi vùng'], ['PAPER', 'Nền be như giấy'], ['TOXIC', 'Chỉ dùng xanh lá chói']), answer: 'NEON_NIGHT' },
          { id: 'art-2', title: 'Độ tương phản', prompt: 'Vấn đề: Nút hành động chính bị chìm trên nền tối. Cặp màu nào giúp người chơi nhận ra nút ngay?', options: options(['MINT_DARK', 'Chữ mint trên nền than'], ['GREY_GREY', 'Xám trên xám'], ['PINK_RED', 'Hồng trên đỏ'], ['BLACK_DARK', 'Đen trên xanh navy']), answer: 'MINT_DARK' },
          { id: 'art-3', title: 'Bàn giao asset', prompt: 'Vấn đề: Team khác nhận gói hình ảnh nhưng không biết file nào dùng cho trạng thái nào. Team Art nên bàn giao package ra sao?', options: options(['NAMED_SPRITES', 'Tên file + kích thước + trạng thái'], ['RANDOM_FILES', 'File không có thông tin'], ['FLAT_IMAGE', 'Chỉ gửi một ảnh duy nhất'], ['NO_EVIDENCE', 'Không gửi screenshot']), answer: 'NAMED_SPRITES' },
        ],
      }
    case 'KEYFRAME_TIMING':
    case 'STATE_TRANSITION':
      return {
        title: jobId === 'KEYFRAME_TIMING' ? 'Keyframe Timing' : 'State Transition',
        instruction: 'Đọc tình huống chuyển động rồi chọn cách sắp xếp để người chơi nhìn và cảm nhận đúng hành động.',
        steps: [
          { id: 'animation-1', title: 'Thứ tự chuyển động', prompt: 'Vấn đề: Cú đánh nhìn bị gấp và người chơi không kịp nhận ra. Team Animation nên sắp xếp keyframe theo thứ tự nào?', options: options(['ANTICIPATE_HIT_RECOVER', 'Chuẩn bị → đánh → hồi phục'], ['HIT_ANTICIPATE', 'Đánh → chuẩn bị → hồi phục'], ['RECOVER_HIT', 'Hồi phục → đánh'], ['IDLE_HIT_IDLE', 'Đứng yên → đánh, bỏ bước chuẩn bị']), answer: 'ANTICIPATE_HIT_RECOVER' },
          { id: 'animation-2', title: 'Khoảnh khắc va chạm', prompt: 'Vấn đề: Cú đánh có lực nhưng người chơi không nhận ra lúc va chạm. Team Animation nên đặt frame va chạm thế nào?', options: options(['SHORT_ACCENT', 'Ngắn và có điểm nhấn rõ'], ['FLAT_LONG', 'Kéo dài như các frame khác'], ['RANDOM', 'Đặt ngẫu nhiên'], ['REMOVE', 'Bỏ frame va chạm']), answer: 'SHORT_ACCENT' },
          { id: 'animation-3', title: 'Chuyển trạng thái an toàn', prompt: 'Vấn đề: Nhân vật gặp một trạng thái không có đường chuyển tiếp hợp lệ. Nên cho nhân vật quay về đâu để game không đứng hình?', options: options(['IDLE_FALLBACK', 'Quay về trạng thái đứng yên'], ['FREEZE', 'Giữ nguyên một frame'], ['HIDDEN', 'Ẩn nhân vật'], ['LOOP_ERROR', 'Lặp lỗi vô hạn']), answer: 'IDLE_FALLBACK' },
        ],
      }
    case 'MECHANIC_BLUEPRINT':
    case 'BALANCE_CARDS':
    case 'FEATURE_HANDOFF':
      return {
        title: jobId === 'MECHANIC_BLUEPRINT' ? 'Mechanic Blueprint' : jobId === 'BALANCE_CARDS' ? 'Balance Cards' : 'Feature Handoff',
        instruction: 'Đọc brief và chọn phương án đáp ứng đủ thời lượng, rủi ro và điều kiện bàn giao.',
        steps: [
          { id: 'design-1', title: 'Nhịp chơi', prompt: 'Vấn đề: Mỗi lượt chơi phải dưới 3 phút nhưng vẫn cần một lần người chơi tự quyết. Team Game Design nên chọn flow nào?', options: options(['FAST_DECISION', 'Một vòng ngắn + một lựa chọn'], ['LONG_TUTORIAL', 'Tutorial dài 10 bước'], ['NO_CHOICE', 'Tự động hoàn toàn'], ['RANDOM_CHAIN', 'Nhiều bước không báo trước']), answer: 'FAST_DECISION' },
          { id: 'design-2', title: 'Mức rủi ro', prompt: 'Vấn đề: Tính năng được yêu cầu có mức biến động trung bình. Cách thể hiện rủi ro nào rõ ràng và công bằng hơn?', options: options(['VISIBLE_TRADEOFF', 'Cho thấy trade-off trước khi chọn'], ['ALL_OR_NOTHING', 'All-in nhưng không báo trước'], ['NO_RISK', 'Bỏ hoàn toàn rủi ro'], ['HIDDEN_COST', 'Ẩn chi phí']), answer: 'VISIBLE_TRADEOFF' },
          { id: 'design-3', title: 'Bàn giao brief', prompt: 'Vấn đề: Team khác sắp nhận một feature nhưng chưa biết mục tiêu và điều kiện nghiệm thu. Một brief tốt cần có gì?', options: options(['ACCEPTANCE_CRITERIA', 'Mục tiêu + giới hạn + tiêu chí nghiệm thu'], ['VIBE_ONLY', 'Chỉ có moodboard'], ['NO_OWNER', 'Không chỉ định người phụ trách'], ['SECRET_RULES', 'Không ghi luật']), answer: 'ACCEPTANCE_CRITERIA' },
        ],
      }
    case 'UI_COMPONENT_ASSEMBLY':
    case 'RESPONSIVE_LAYOUT':
      return {
        title: jobId === 'UI_COMPONENT_ASSEMBLY' ? 'UI Component Assembly' : 'Responsive Layout',
        instruction: 'Đọc vấn đề giao diện rồi chọn trạng thái hoặc bố cục giúp người chơi luôn hiểu được điều đang xảy ra.',
        steps: [
          { id: 'frontend-1', title: 'Đang tải dữ liệu', prompt: 'Vấn đề: Người chơi vừa bấm tải dữ liệu nhưng server chưa trả lời. Giao diện nên hiển thị gì để họ biết app vẫn đang xử lý?', options: options(['LOADING', 'Trạng thái đang tải kèm phản hồi rõ'], ['SUCCESS', 'Báo thành công trước'], ['HIDDEN', 'Ẩn màn hình không giải thích'], ['ERROR', 'Báo lỗi dù chưa có lỗi']), answer: 'LOADING' },
          { id: 'frontend-2', title: 'Nút gửi', prompt: 'Vấn đề: Người chơi chưa điền đủ thông tin bắt buộc nhưng nút Gửi vẫn có thể bấm. Nút nên ở trạng thái nào?', options: options(['DISABLED', 'Tắt nút và chỉ rõ phần còn thiếu'], ['PRESSED', 'Tự bấm liên tục'], ['SUCCESS', 'Báo thành công'], ['INVISIBLE', 'Ẩn nút hoàn toàn']), answer: 'DISABLED' },
          { id: 'frontend-3', title: 'Màn hình hẹp', prompt: 'Vấn đề: Trên điện thoại hẹp, các nút và chữ bị chồng lên nhau. Bố cục nào dễ đọc nhất?', options: options(['STACK', 'Xếp thành cột và giữ nút chính'], ['SHRINK_ALL', 'Thu nhỏ tất cả chữ'], ['OVERFLOW', 'Cho nội dung tràn ngang'], ['HIDE_CORE', 'Ẩn nội dung chính']), answer: 'STACK' },
        ],
      }
    case 'API_FLOW_ROUTING':
    case 'EVENT_SCHEMA_DEBUG':
    case 'BUILD_VERIFICATION':
      return {
        title: jobId === 'API_FLOW_ROUTING' ? 'API Flow Routing' : jobId === 'EVENT_SCHEMA_DEBUG' ? 'Event Schema Debug' : 'Build Verification',
        instruction: 'Đọc tình huống server và chọn cách xử lý theo thứ tự an toàn: kiểm tra → luật nghiệp vụ → ghi nhận → phản hồi.',
        steps: [
          { id: 'backend-1', title: 'Thứ tự xử lý', prompt: 'Vấn đề: Người chơi gửi yêu cầu nhận thưởng. Server phải làm bước nào trước khi ghi Coin?', options: options(['VALIDATE_DOMAIN', 'Kiểm tra dữ liệu và luật nghiệp vụ'], ['WRITE_CLIENT', 'Ghi đúng con số client gửi'], ['RESPOND_FIRST', 'Trả kết quả trước rồi mới kiểm tra'], ['PAY_TWICE', 'Ghi thưởng hai lần để dự phòng']), answer: 'VALIDATE_DOMAIN' },
          { id: 'backend-2', title: 'Request gửi lại', prompt: 'Vấn đề: Mạng chập chờn khiến cùng một yêu cầu nhận thưởng được gửi lại. Cách nào ngăn việc cộng thưởng hai lần?', options: options(['UNIQUE_KEY', 'Dùng mã idempotency duy nhất'], ['CLIENT_COUNTER', 'Tin vào bộ đếm của client'], ['TIME_ONLY', 'Chỉ dựa vào thời gian gửi'], ['RANDOM_BALANCE', 'Chọn số dư ngẫu nhiên']), answer: 'UNIQUE_KEY' },
          { id: 'backend-3', title: 'Dữ liệu trả về', prompt: 'Vấn đề: Sau khi server thanh toán xong, client cần biết số dư mới và phần thay đổi. Dữ liệu nên do ai tạo?', options: options(['CANONICAL_RECEIPT', 'Server tạo receipt với số dư và delta đã xác nhận'], ['CLIENT_SCORE', 'Dùng điểm client tự gửi'], ['CLIENT_COIN', 'Dùng số Coin client tự tính'], ['HIDDEN_ANSWER', 'Gửi luôn đáp án challenge']), answer: 'CANONICAL_RECEIPT' },
        ],
      }
    case 'BUG_HUNT':
    case 'REGRESSION_MATRIX':
      return {
        title: jobId === 'BUG_HUNT' ? 'Bug Hunt' : 'Regression Matrix',
        instruction: 'Đọc triệu chứng lỗi, xác định mức độ ảnh hưởng và chọn cách kiểm thử lại phù hợp.',
        steps: [
          { id: 'qa-1', title: 'Triệu chứng runtime', prompt: 'Vấn đề: Sau khi reconnect, người chơi nhận cùng một reward hai lần. Team QA nên phân loại lỗi này thế nào?', options: options(['DUPLICATE_REWARD', 'Lỗi logic / chống gửi trùng'], ['COLOR_SHIFT', 'Chỉ lỗi màu sắc'], ['AUDIO_DROP', 'Lỗi âm thanh'], ['LOCAL_TEXT', 'Lỗi câu chữ']), answer: 'DUPLICATE_REWARD' },
          { id: 'qa-2', title: 'Mức độ ưu tiên', prompt: 'Vấn đề: Server đã trừ Coin nhưng người chơi không nhận được tiền. Team QA nên đánh dấu mức độ nào?', options: options(['CRITICAL', 'Nghiêm trọng, cần ưu tiên cao'], ['MINOR', 'Lỗi nhỏ'], ['COSMETIC', 'Chỉ lỗi trang trí'], ['WONT_FIX', 'Không sửa']), answer: 'CRITICAL' },
          { id: 'qa-3', title: 'Kiểm tra hồi quy', prompt: 'Vấn đề: Wallet vừa thay đổi cách cộng/trừ Coin. Nhóm test nào cần chạy lại để tránh làm hỏng flow khác?', options: options(['WALLET_SOCIAL_WORK', 'Settlement của Work + Social + Wallet'], ['ONLY_ART', 'Chỉ preview Art'], ['ONLY_CHAT', 'Chỉ chat'], ['NO_TEST', 'Không cần test lại']), answer: 'WALLET_SOCIAL_WORK' },
        ],
      }
    case 'CHECKLIST_AUDIT':
    case 'EVIDENCE_VALIDATION':
    case 'RELEASE_CHECK':
      return {
        title: jobId === 'CHECKLIST_AUDIT' ? 'Checklist Audit' : jobId === 'EVIDENCE_VALIDATION' ? 'Evidence Validation' : 'Release Check',
        instruction: 'Đọc tình huống kiểm tra và chọn bằng chứng hoặc trạng thái gate phù hợp. Thiếu bằng chứng thì chưa được Pass.',
        steps: [
          { id: 'qc-1', title: 'Xác định đúng build', prompt: 'Vấn đề: Có hai bản build cùng tên và team cần biết đang kiểm tra bản nào. Bằng chứng nào đáng tin nhất?', options: options(['BUILD_ID_HASH', 'Build ID kèm config hoặc hash'], ['MOODBOARD', 'Moodboard'], ['CHAT_ONLY', 'Một tin nhắn xác nhận'], ['COLOR_PICKER', 'Ảnh color picker']), answer: 'BUILD_ID_HASH' },
          { id: 'qc-2', title: 'Thiếu asset', prompt: 'Vấn đề: Danh sách ghi có 8 sprite nhưng package chỉ có 7. Team QC nên đánh dấu thế nào?', options: options(['MISMATCH', 'Mismatch và chặn quality gate'], ['PASS', 'Pass'], ['OPTIONAL', 'Optional'], ['ARCHIVE', 'Archive ngay']), answer: 'MISMATCH' },
          { id: 'qc-3', title: 'Xử lý feedback', prompt: 'Vấn đề: Reviewer ghi “Yellow / cần cân nhắc”, chưa yêu cầu chặn release. Team QC nên xử lý feedback ra sao?', options: options(['RECORD_DISPOSITION', 'Ghi rõ quyết định và lý do xử lý'], ['DELETE', 'Xóa khỏi log'], ['AUTO_BLOCK', 'Luôn chặn release'], ['IGNORE', 'Bỏ qua']), answer: 'RECORD_DISPOSITION' },
        ],
      }
    case 'SPRINT_PLANNING':
    case 'RISK_TRIAGE':
    case 'TEAM_KICKOFF':
      return {
        title: jobId === 'SPRINT_PLANNING' ? 'Sprint Planning' : jobId === 'RISK_TRIAGE' ? 'Risk Triage' : 'Team Kickoff',
        instruction: 'Đọc tình huống kế hoạch và chọn phương án có owner, thứ tự phụ thuộc và khối lượng thực tế.',
        steps: [
          { id: 'pm-1', title: 'Ưu tiên', prompt: 'Vấn đề: Một task quan trọng phải xong hôm nay nhưng chưa có người phụ trách rõ. Team PM nên xếp task này thế nào?', options: options(['FIRST_VISIBLE', 'Đưa lên đầu và chỉ định owner'], ['LAST', 'Để cuối sprint'], ['NO_OWNER', 'Không cần owner'], ['HIDDEN', 'Ẩn khỏi board']), answer: 'FIRST_VISIBLE' },
          { id: 'pm-2', title: 'Phụ thuộc', prompt: 'Vấn đề: Task B chỉ chạy được sau khi API của task A hoàn tất. Team PM nên sắp xếp thứ tự nào?', options: options(['A_THEN_B', 'Làm A trước, sau đó làm B'], ['B_THEN_A', 'Làm B trước A'], ['PARALLEL_ANYWAY', 'Luôn cho chạy song song'], ['DELETE_A', 'Xóa task A']), answer: 'A_THEN_B' },
          { id: 'pm-3', title: 'Khối lượng', prompt: 'Vấn đề: Người phụ trách đã kín lịch nhưng vẫn được giao thêm task. Cách xử lý nào an toàn?', options: options(['REASSIGN_SCOPE', 'Chuyển bớt việc hoặc giảm scope'], ['ADD_MORE', 'Giao thêm việc'], ['HIDE_RISK', 'Ẩn rủi ro'], ['MOVE_DEADLINE_SILENT', 'Đổi deadline mà không báo']), answer: 'REASSIGN_SCOPE' },
        ],
      }
    case 'ONBOARDING_DESK':
    case 'TEAM_MATCH':
      return {
        title: jobId === 'ONBOARDING_DESK' ? 'Onboarding Desk' : 'Team Match',
        instruction: 'Đọc tình huống của người mới và chọn bước hỗ trợ phù hợp nhất. Tất cả persona chỉ là dữ liệu giả lập.',
        steps: [
          { id: 'hr-1', title: 'Bước đầu tiên', prompt: 'Vấn đề: Một thành viên mới vừa vào studio và chưa có thông tin tài khoản. Team HR nên hỗ trợ việc gì trước?', options: options(['ACCOUNT_AVATAR', 'Tạo account và avatar'], ['FIRST_BUG', 'Giao bug ngay'], ['SALARY_REAL', 'Hỏi lương thật ngay'], ['PRIVATE_DATA', 'Xin dữ liệu nhạy cảm']), answer: 'ACCOUNT_AVATAR' },
          { id: 'hr-2', title: 'Buddy', prompt: 'Vấn đề: Người mới không biết hỏi ai khi gặp vướng mắc. Buddy nên giúp họ điều gì?', options: options(['CONTEXT_SUPPORT', 'Hiểu context và biết nơi cần hỏi'], ['PERFORMANCE_SCORE', 'Chấm năng suất'], ['WALLET_ACCESS', 'Cấp quyền wallet'], ['REPLACE_MANAGER', 'Thay manager']), answer: 'CONTEXT_SUPPORT' },
          { id: 'hr-3', title: 'Việc đầu tiên', prompt: 'Vấn đề: Cần giao việc đầu tiên cho thành viên mới nhưng không muốn họ bị quá tải. Assignment nên có đặc điểm gì?', options: options(['SMALL_SCOPED', 'Nhỏ, có scope và tiêu chí nghiệm thu rõ'], ['SECRET_HARD', 'Khó và không hướng dẫn'], ['UNLIMITED', 'Không có deadline'], ['REAL_PERSON_DATA', 'Dùng dữ liệu người thật']), answer: 'SMALL_SCOPED' },
        ],
      }
    default:
      return {
        title: 'Studio Shift',
        instruction: 'Đọc vấn đề, xác định team phù hợp và chọn cách xử lý có thể kiểm chứng.',
        steps: [
          { id: 'generic-1', title: 'Đọc brief', prompt: 'Vấn đề: Bạn vừa nhận một job nhưng yêu cầu còn nhiều điểm chưa rõ. Việc đầu tiên nên làm là gì?', options: options(['READ_SCOPE', 'Đọc scope và tiêu chí nghiệm thu'], ['GUESS', 'Tự đoán yêu cầu'], ['SKIP', 'Bỏ qua brief']), answer: 'READ_SCOPE' },
          { id: 'generic-2', title: 'Kiểm tra', prompt: 'Vấn đề: Bạn chưa chắc dữ liệu hoặc yêu cầu hiện tại có đúng. Nên làm gì trước khi tiếp tục?', options: options(['ASK_EVIDENCE', 'Kiểm tra bằng chứng và context'], ['HIDE', 'Ẩn vấn đề'], ['DUPLICATE', 'Làm lại ngẫu nhiên']), answer: 'ASK_EVIDENCE' },
          { id: 'generic-3', title: 'Bàn giao', prompt: 'Vấn đề: Team khác cần tiếp nhận kết quả của bạn. Bàn giao thế nào để họ biết trạng thái và có thể kiểm tra lại?', options: options(['CLEAR_RECEIPT', 'Gửi receipt rõ, có trạng thái'], ['NO_TRACE', 'Không lưu dấu'], ['CLIENT_BALANCE', 'Tin số client tự tính']), answer: 'CLEAR_RECEIPT' },
        ],
      }
  }
}

export function createWorkChallenge(job: WorkJobDefinition | undefined, sessionId: string, mode: WorkSessionMode = 'JOB', careerId?: WorkCareerId, targetRank?: WorkRankId, currentRank: WorkRankId = 'INTERN'): WorkChallengeInternal {
  const resolvedJob = job || workJobDefinition('INBOX_TRIAGE')!
  const rankForDifficulty = mode === 'CERTIFICATION' ? (targetRank || currentRank) : currentRank
  const difficulty = difficultyForRank(rankForDifficulty)
  if (careerId && resolvedJob.id !== 'INBOX_TRIAGE') {
    const seed = hashSeed(`${sessionId}:${resolvedJob.id}:${careerId}:${rankForDifficulty}`)
    const eligibleQuestions = buildCareerQuestionBank(careerId).filter((question) => question.difficulty === difficulty)
    const questionCount = mode === 'CERTIFICATION' ? 5 : 3
    const start = seed % eligibleQuestions.length
    const stride = 37
    const selected = Array.from({ length: questionCount }, (_, index) => eligibleQuestions[(start + index * stride) % eligibleQuestions.length])
    const solutionByStep: Record<string, string> = {}
    const steps: WorkChallengeStep[] = selected.map((question, index) => {
      solutionByStep[question.id] = question.answer
      return {
        id: question.id,
        title: question.title,
        prompt: question.prompt,
        options: rotate(question.options, (seed + index * 7) % question.options.length),
        image: question.image,
      }
    })
    return {
      publicChallenge: {
        mode,
        sessionId,
        jobId: mode === 'JOB' ? resolvedJob.id : undefined,
        careerId,
        targetRank,
        title: mode === 'CERTIFICATION' ? (workCareerDefinition(careerId)?.certificationName || 'Career Certification') : resolvedJob.name,
        instruction: `Đọc vấn đề trước, xác định nhóm ${workCareerDefinition(careerId)?.name || careerId} đang phụ trách rồi chọn cách xử lý chuyên môn phù hợp nhất.`,
        difficulty,
        difficultyLabel: difficultyLabel(difficulty),
        questionBankSize: careerQuestionBankSize(careerId),
        durationSeconds: mode === 'CERTIFICATION' ? 240 : Math.max(resolvedJob.durationSeconds, 90 + difficulty * 15),
        steps,
      },
      solutionByStep,
    }
  }
  const template = mode === 'CERTIFICATION' && careerId
    ? { ...jobTemplate(resolvedJob.id), title: workCareerDefinition(careerId)?.certificationName || 'Career Certification', instruction: `Certification ${workRankDefinitions.find((rank) => rank.id === targetRank)?.name || 'rank'}: chứng minh bạn đã sẵn sàng cho cấp bậc mới.` }
    : jobTemplate(resolvedJob.id)
  const seed = hashSeed(`${sessionId}:${resolvedJob.id}:${careerId || ''}:${targetRank || ''}`)
  const solutionByStep: Record<string, string> = {}
  const steps: WorkChallengeStep[] = template.steps.map((step, index) => {
    solutionByStep[step.id] = step.answer
    return { id: step.id, title: step.title, prompt: step.prompt, options: rotate(step.options, (seed + index * 7) % step.options.length) }
  })
  return {
    publicChallenge: {
      mode,
      sessionId,
      jobId: mode === 'JOB' ? resolvedJob.id : undefined,
      careerId,
      targetRank,
      title: template.title,
      instruction: template.instruction,
      difficulty,
      difficultyLabel: difficultyLabel(difficulty),
      durationSeconds: resolvedJob.durationSeconds,
      steps,
    },
    solutionByStep,
  }
}

export function validateWorkAction(challenge: WorkChallengeInternal, stepId: string, optionId: string): boolean {
  const step = challenge.publicChallenge.steps.find((candidate) => candidate.id === stepId)
  return Boolean(step && step.options.some((option) => option.id === optionId))
}

export function evaluateWorkChallenge(challenge: WorkChallengeInternal, actions: WorkActionRecord[], elapsedMs: number): WorkScoreResult {
  const latestByStep = new Map<string, WorkActionRecord>()
  actions.forEach((action) => {
    if (validateWorkAction(challenge, action.stepId, action.optionId)) latestByStep.set(action.stepId, action)
  })
  const answeredSteps = latestByStep.size
  const totalSteps = Math.max(1, challenge.publicChallenge.steps.length)
  let correct = 0
  latestByStep.forEach((action, stepId) => {
    if (challenge.solutionByStep[stepId] === action.optionId) correct += 1
  })
  const accuracy = Math.round(correct / totalSteps * 100)
  const completion = Math.round(answeredSteps / totalSteps * 100)
  const durationMs = challenge.publicChallenge.durationSeconds * 1000
  const safeElapsed = Math.max(0, Math.min(durationMs, elapsedMs))
  const speed = Math.round((1 - safeElapsed / durationMs) * 100)
  const score = Math.max(0, Math.min(100, Math.round(accuracy * 0.7 + speed * 0.2 + completion * 0.1)))
  const grade: WorkGrade = score >= 90 ? 'S' : score >= 75 ? 'A' : score >= 55 ? 'B' : 'C'
  return { score, grade, accuracy, speed, completion, answeredSteps }
}

export function workGradeReward(base: number, grade: WorkGrade, kind: 'coin' | 'careerXp'): number {
  return Math.round(base * workEconomy.gradeMultipliers[grade][kind])
}
