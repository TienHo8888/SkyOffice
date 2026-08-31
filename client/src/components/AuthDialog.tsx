import React, { useState } from 'react'
import { useAppDispatch } from '../hooks'
import { setAuthSession } from '../stores/UserStore'
import { studioApi, StudioApiError } from '../services/StudioApi'

export default function AuthDialog() {
  const dispatch = useAppDispatch()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      dispatch(setAuthSession(await studioApi.login(identifier, password)))
    } catch (requestError) {
      setError(requestError instanceof StudioApiError ? requestError.message : 'Không thể kết nối Studio API.')
    } finally {
      setLoading(false)
    }
  }

  return <div className="auth-screen"><div className="auth-card"><div className="auth-brand"><span className="studio-brand-mark"><i /><i /><i /></span><div><strong>TOHI<span>/</span>STUDIO</strong><small>GAME STUDIO OS</small></div></div><span className="auth-kicker">PRIVATE STUDIO WORKSPACE</span><h1>Build better games,<br /><em>together.</em></h1><p className="auth-intro">Đăng nhập để vào virtual studio, task board, sprint boss và toàn bộ production context của team.</p><form onSubmit={handleSubmit}><label>Tài khoản<input autoFocus autoComplete="username" placeholder="Username hoặc email" type="text" value={identifier} onChange={(event) => setIdentifier(event.target.value)} /></label><label>Mật khẩu<input autoComplete="current-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>{error && <div className="auth-error">{error}</div>}<button className="auth-submit" disabled={loading} type="submit">{loading ? 'Connecting…' : 'Enter the studio →'}</button></form></div></div>
}
