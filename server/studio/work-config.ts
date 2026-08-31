import { isWorkInteractiveObject, studioInteractiveObjects } from '../../types/StudioWorld'
import { WORK_CAREER_DEFINITIONS, WORK_JOB_DEFINITIONS, WORK_RANK_DEFINITIONS, WorkCareerId, WorkGrade, WorkRankId } from '../../types/Work'

export const workCareerDefinitions = WORK_CAREER_DEFINITIONS
export const workJobDefinitions = WORK_JOB_DEFINITIONS
export const workRankDefinitions = WORK_RANK_DEFINITIONS

export const workEconomy = {
  paidJobsPerDay: 8,
  workSessionsPerDay: 12,
  careerXpPerDay: 500,
  salaryJobsRequired: 3,
  careerChangeCooldownMs: 24 * 60 * 60 * 1000,
  certificationPassScore: 70,
  gradeMultipliers: {
    S: { coin: 1.25, careerXp: 1.2 },
    A: { coin: 1, careerXp: 1 },
    B: { coin: 0.8, careerXp: 0.8 },
    C: { coin: 0.6, careerXp: 0.6 },
  } as Record<WorkGrade, { coin: number; careerXp: number }>,
  streakBonus: (streak: number) => streak >= 7 ? 0.1 : streak >= 3 ? 0.05 : 0,
}

export const workStationDefinitions = studioInteractiveObjects.filter((object) => isWorkInteractiveObject(object.type))
  .filter((object) => object.stationId && ['JOB_BOARD', 'GAME_DESIGN_STATION', 'ART_STATION', 'ANIMATION_STATION', 'FRONTEND_STATION', 'BACKEND_STATION', 'QA_STATION', 'QC_STATION', 'CAREER_CENTER', 'PAYROLL_OFFICE', 'PM_STATION', 'HR_STATION'].includes(object.stationId))
  .map((object) => ({ id: object.stationId!, label: object.label, roomId: object.roomId, x: object.x, y: object.y, interactionRadius: object.interactionRadius }))

export function workJobDefinition(jobId: string) {
  return workJobDefinitions.find((job) => job.id === jobId)
}

export function workCareerDefinition(careerId: WorkCareerId) {
  return workCareerDefinitions.find((career) => career.id === careerId)
}

export function workRankIndex(rank: WorkRankId): number {
  return workRankDefinitions.findIndex((entry) => entry.id === rank)
}

export function workRankForXp(xp: number): WorkRankId {
  let rank: WorkRankId = 'INTERN'
  workRankDefinitions.forEach((entry) => {
    if (xp >= entry.careerXpRequired) rank = entry.id
  })
  return rank
}

export function workNextRank(rank: WorkRankId): WorkRankId | undefined {
  const next = workRankDefinitions[workRankIndex(rank) + 1]
  return next?.id
}

export function workSalaryForRank(rank: WorkRankId): number {
  return workRankDefinitions.find((entry) => entry.id === rank)?.dailySalary || 0
}

export function workSalaryBonus(streak: number, baseSalary: number): number {
  return Math.floor(baseSalary * workEconomy.streakBonus(streak))
}
