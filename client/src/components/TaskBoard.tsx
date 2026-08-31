import React, { useEffect, useMemo, useState } from 'react'
import { CompletionResponse, StudioSnapshot, Task, TaskPriority, TaskStatus } from '../../../types/Studio'
import { studioApi, StudioApiError } from '../services/StudioApi'

const columns: Array<{ status: TaskStatus; label: string }> = [
  { status: 'BACKLOG', label: 'Backlog' },
  { status: 'TODO', label: 'Todo' },
  { status: 'IN_PROGRESS', label: 'In progress' },
  { status: 'REVIEW', label: 'Review' },
  { status: 'DONE', label: 'Done' },
]

const priorityLabels: Record<TaskPriority, string> = { LOW: 'Low', NORMAL: 'Normal', HIGH: 'High', CRITICAL: 'Critical' }
const managerRoles = new Set(['OWNER', 'ADMIN', 'PRODUCER', 'GAME_DESIGNER'])

interface TaskBoardProps {
  token: string
  snapshot: StudioSnapshot | null
  refreshKey: number
  onCompletion: (completion: CompletionResponse) => void
  onNotice: (notice: string) => void
}

export default function TaskBoard({ token, snapshot, refreshKey, onCompletion, onNotice }: TaskBoardProps) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [priority, setPriority] = useState<TaskPriority>('NORMAL')
  const [assigneeId, setAssigneeId] = useState('')
  const [bossDamage, setBossDamage] = useState('100')
  const [busyTaskId, setBusyTaskId] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')

  const currentMember = snapshot?.members.find((member) => member.id === snapshot.personalProgress.userId)
  const canManage = Boolean(currentMember && managerRoles.has(currentMember.role))
  const memberNames = useMemo(() => new Map((snapshot?.members || []).map((member) => [member.id, member.displayName])), [snapshot?.members])

  const loadTasks = () => {
    setLoading(true)
    studioApi.tasks(token)
      .then(setTasks)
      .catch((requestError) => setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể tải task board.'))
      .finally(() => setLoading(false))
  }

  useEffect(loadTasks, [token, refreshKey])

  const byStatus = useMemo(() => columns.reduce<Record<TaskStatus, Task[]>>((result, column) => {
    result[column.status] = tasks.filter((task) => task.status === column.status)
    return result
  }, { BACKLOG: [], TODO: [], IN_PROGRESS: [], REVIEW: [], DONE: [], CANCELLED: [] }), [tasks])

  const complete = async (task: Task) => {
    setBusyTaskId(task.id)
    setError('')
    try {
      const completion = await studioApi.completeTask(token, task.id)
      onCompletion(completion)
      onNotice(`Đã complete “${task.title}”: +${completion.quest.xpReward} Work XP · +${completion.gameXpDelta} Character EXP · boss -${completion.quest.bossDamage} HP`)
      loadTasks()
    } catch (requestError) {
      setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể complete task.')
    } finally {
      setBusyTaskId('')
    }
  }

  const move = async (task: Task, status: TaskStatus) => {
    if (status === task.status || status === 'DONE') return
    setBusyTaskId(task.id)
    try {
      const updated = await studioApi.updateTask(token, task.id, { status })
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item))
    } catch (requestError) {
      setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể cập nhật task.')
    } finally {
      setBusyTaskId('')
    }
  }

  const updatePriority = async (task: Task, nextPriority: TaskPriority) => {
    if (!canManage || nextPriority === task.priority) return
    setBusyTaskId(task.id)
    try {
      const updated = await studioApi.updateTask(token, task.id, { priority: nextPriority })
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item))
      onNotice(`Đã đổi priority của “${task.title}” thành ${priorityLabels[nextPriority]}.`)
    } catch (requestError) {
      setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể đổi priority.')
    } finally {
      setBusyTaskId('')
    }
  }

  const startEdit = (task: Task) => {
    setEditingId(task.id)
    setEditTitle(task.title)
    setEditDescription(task.description)
  }

  const saveEdit = async (event: React.FormEvent<HTMLFormElement>, task: Task) => {
    event.preventDefault()
    if (!editTitle.trim()) return
    setBusyTaskId(task.id)
    try {
      const updated = await studioApi.updateTask(token, task.id, { title: editTitle.trim(), description: editDescription.trim() })
      setTasks((current) => current.map((item) => item.id === updated.id ? updated : item))
      setEditingId('')
      onNotice(`Đã cập nhật task “${updated.title}”.`)
    } catch (requestError) {
      setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể edit task.')
    } finally {
      setBusyTaskId('')
    }
  }

  const remove = async (task: Task) => {
    if (!canManage || task.status === 'DONE' || !window.confirm(`Delete task “${task.title}”?`)) return
    setBusyTaskId(task.id)
    try {
      await studioApi.deleteTask(token, task.id)
      setTasks((current) => current.filter((item) => item.id !== task.id))
      onNotice(`Đã xoá task “${task.title}”.`)
    } catch (requestError) {
      setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể xoá task.')
    } finally {
      setBusyTaskId('')
    }
  }

  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const project = snapshot?.projects.find((item) => item.status === 'ACTIVE') || snapshot?.projects[0]
    if (!project || !title.trim()) return
    setBusyTaskId('new')
    try {
      const task = await studioApi.createTask(token, { projectId: project.id, sprintId: snapshot?.activeSprint?.id, title, description, priority, assigneeId: assigneeId || undefined, bossDamage: Number(bossDamage) || undefined })
      setTasks((current) => [...current, task])
      setTitle('')
      setDescription('')
      setPriority('NORMAL')
      setAssigneeId('')
      setBossDamage('100')
      setShowCreate(false)
      onNotice(`Đã tạo quest “${task.title}” với ${task.bossDamage} boss damage.`)
    } catch (requestError) {
      setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể tạo task.')
    } finally {
      setBusyTaskId('')
    }
  }

  return <div className="task-board">
    <div className="task-board-head"><div><span className="studio-kicker">WORKSPACE / QUEST PIPELINE</span><h2>Task board</h2><p>Task thật trở thành quest thật. Completion cấp Work XP, Character EXP và đánh Sprint Boss.</p></div>{canManage && <button className="studio-primary" onClick={() => setShowCreate((value) => !value)}>+ Create task</button>}</div>
    {snapshot?.boss && <section className="task-boss-card"><div><span className="studio-kicker">ACTIVE SPRINT · {snapshot.activeSprint?.name || 'Current chapter'}</span><h3>{snapshot.boss.name}</h3><p>{snapshot.activeSprint?.progress || 0}% sprint complete · {snapshot.boss.status}</p></div><div className="task-boss-hp"><strong>{snapshot.boss.currentHp.toLocaleString()} <small>/ {snapshot.boss.maxHp.toLocaleString()} HP</small></strong><div className="studio-progress"><i style={{ width: `${Math.max(0, snapshot.boss.currentHp / snapshot.boss.maxHp * 100)}%` }} /></div></div></section>}
    {showCreate && canManage && <form className="task-create-form" onSubmit={create}><label>Task title<input required autoFocus value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ví dụ: Review side bet math" /></label><label>Description<input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Acceptance criteria hoặc context" /></label><label>Assignee<select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}><option value="">Unassigned</option>{(snapshot?.members || []).map((member) => <option value={member.id} key={member.id}>{member.displayName} · {member.role}</option>)}</select></label><label>Priority<select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}><option value="LOW">Low</option><option value="NORMAL">Normal</option><option value="HIGH">High / Main quest</option><option value="CRITICAL">Critical / Elite quest</option></select></label><label>Boss damage<input type="number" min="1" step="50" value={bossDamage} onChange={(event) => setBossDamage(event.target.value)} /></label><button className="studio-primary" disabled={busyTaskId === 'new'} type="submit">Create quest</button></form>}
    {error && <div className="task-error">{error}</div>}
    {loading ? <div className="task-empty">Loading task board…</div> : <div className="task-columns">{columns.map((column) => <section className={`task-column task-column-${column.status.toLowerCase()}`} key={column.status}><div className="task-column-head"><h3>{column.label}</h3><b>{byStatus[column.status].length}</b></div>{byStatus[column.status].length === 0 && <div className="task-empty">No tasks yet</div>}{byStatus[column.status].map((task) => <article className="task-card" key={task.id}><div className="task-card-top"><span className={`task-priority priority-${task.priority.toLowerCase()}`}>{priorityLabels[task.priority]}</span><span>{task.bossDamage} dmg</span></div>{editingId === task.id && canManage ? <form className="task-edit-form" onSubmit={(event) => saveEdit(event, task)}><input value={editTitle} onChange={(event) => setEditTitle(event.target.value)} aria-label={`Edit ${task.title} title`} /><textarea value={editDescription} onChange={(event) => setEditDescription(event.target.value)} aria-label={`Edit ${task.title} description`} /><div><button className="task-complete" type="submit" disabled={busyTaskId === task.id}>Save</button><button className="task-cancel" type="button" onClick={() => setEditingId('')}>Cancel</button></div></form> : <><h4>{task.title}</h4><p>{task.description || 'No description yet.'}</p></>}<div className="task-card-meta"><span>{task.questXp} XP</span><span>{task.assigneeId ? `→ ${memberNames.get(task.assigneeId) || 'Assigned'}` : 'Unassigned'}</span></div><div className="task-card-controls">{canManage && <><button className="task-edit-button" type="button" onClick={() => startEdit(task)}>{editingId === task.id ? 'Editing' : 'Edit'}</button><select aria-label={`Priority ${task.title}`} disabled={task.status === 'DONE' || busyTaskId === task.id} value={task.priority} onChange={(event) => updatePriority(task, event.target.value as TaskPriority)}>{Object.keys(priorityLabels).map((key) => <option value={key} key={key}>{priorityLabels[key as TaskPriority]}</option>)}</select><button className="task-delete-button" type="button" disabled={task.status === 'DONE' || busyTaskId === task.id} onClick={() => remove(task)}>Delete</button></>}<select aria-label={`Move ${task.title}`} disabled={task.status === 'DONE' || busyTaskId === task.id} value={task.status} onChange={(event) => move(task, event.target.value as TaskStatus)}>{columns.filter((item) => item.status !== 'DONE' || task.status === 'DONE').map((item) => <option value={item.status} key={item.status}>{item.label}</option>)}</select></div>{task.status !== 'DONE' && <button className="task-complete" disabled={busyTaskId === task.id} onClick={() => complete(task)}>{busyTaskId === task.id ? 'Saving…' : 'Complete quest →'}</button>}{task.status === 'DONE' && <span className="task-done">✓ Rewards claimed</span>}</article>)}</section>)}</div>}
  </div>
}
