import React, { useEffect, useState } from 'react'
import styled from 'styled-components'
import IconButton from '@mui/material/IconButton'
import CloseIcon from '@mui/icons-material/Close'

import { useAppSelector, useAppDispatch } from '../hooks'
import { closeWhiteboardDialog } from '../stores/WhiteboardStore'

const Backdrop = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  padding: 16px 180px 16px 16px;
  width: 100%;
  height: 100%;
`
const Wrapper = styled.div`
  width: 100%;
  height: 100%;
  background: #222639;
  border-radius: 16px;
  padding: 16px;
  color: #eee;
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: max-content;

  .close {
    position: absolute;
    top: 0px;
    right: 0px;
  }
`

const WhiteboardWrapper = styled.div`
  flex: 1;
  border-radius: 25px;
  overflow: hidden;
  margin-right: 25px;

  iframe {
    width: 100%;
    height: 100%;
    background: #fff;
  }
`

const LocalBoard = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
  flex-direction: column;
  border: 2px solid #59627e;
  border-radius: 12px;
  overflow: hidden;
  margin-right: 25px;
  background: #f7f3e8;
  box-shadow: inset 0 0 0 4px #d8cfae, 0 8px 24px rgba(0, 0, 0, .22);

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 11px 15px;
    color: #2d344a;
    background: #d8f08c;
    font: 700 13px 'DM Mono', monospace;
    letter-spacing: .6px;
  }

  header small {
    color: #59614e;
    font: 10px 'DM Mono', monospace;
    letter-spacing: 0;
  }

  textarea {
    flex: 1;
    min-height: 240px;
    padding: 22px;
    border: 0;
    outline: 0;
    resize: none;
    color: #263043;
    background-color: #fffdf5;
    background-image: linear-gradient(#e8e0c9 1px, transparent 1px);
    background-size: 100% 28px;
    font: 16px/28px 'DM Mono', monospace;
  }

  footer {
    padding: 8px 15px;
    color: #6f7568;
    background: #eee8d8;
    font: 10px 'DM Mono', monospace;
  }
`

export default function WhiteboardDialog() {
  const whiteboardId = useAppSelector((state) => state.whiteboard.whiteboardId)
  const whiteboardUrl = useAppSelector((state) => state.whiteboard.whiteboardUrl)
  const dispatch = useAppDispatch()
  const storageKey = `studio-whiteboard:${whiteboardId || 'local'}`
  const [note, setNote] = useState('')

  useEffect(() => {
    setNote(window.localStorage.getItem(storageKey) || '')
  }, [storageKey])

  useEffect(() => {
    window.localStorage.setItem(storageKey, note)
  }, [note, storageKey])

  return (
    <Backdrop>
      <Wrapper>
        <IconButton
          aria-label="close dialog"
          className="close"
          onClick={() => dispatch(closeWhiteboardDialog())}
        >
          <CloseIcon />
        </IconButton>
        {whiteboardUrl ? (
          <WhiteboardWrapper>
            <iframe title="white board" src={whiteboardUrl} />
          </WhiteboardWrapper>
        ) : (
          <LocalBoard>
            <header>
              <span>STU WHITEBOARD</span>
              <small>LOCAL STUDIO BOARD</small>
            </header>
            <textarea
              aria-label="Nội dung whiteboard"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Viết ý tưởng, checklist hoặc ghi chú cho room này…"
            />
            <footer>Nội dung tự lưu trên thiết bị này · đóng bảng bằng nút ×</footer>
          </LocalBoard>
        )}
      </Wrapper>
    </Backdrop>
  )
}
