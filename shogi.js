import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// --- Supabase接続設定 ---
const SUPABASE_URL = 'https://tksriuqqarssyotmegmh.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRrc3JpdXFxYXJzc3lvdG1lZ21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzOTU1NjAsImV4cCI6MjA3Nzk3MTU2MH0.ijlOfvZsLhnD3C2DmvNYjWHDjrHnhcAOYa3I2O7BDtk'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

// --- DOM取得 ---
const boardEl = document.getElementById('board')
const joinBtn = document.getElementById('joinBtn')
const roomInput = document.getElementById('roomInput')
const statusEl = document.getElementById('status')

// --- グローバル状態 ---
let board = []      
let turn = 'b'
let room = ''
let mySide = null

// --- Joinボタン押下時 ---
joinBtn.onclick = async () => {
  room = roomInput.value.trim()
  if (!room) return alert('ルーム名を入力してください')

  console.log('🔍 ルーム検索開始:', room)
  const { data, error, status } = await supabase
    .from('games')
    .select('*')
    .eq('room', room)
    .maybeSingle() // ← single()から変更

  console.log('📦 SELECT結果:', { data, error, status })

  if (error) {
    console.error('❌ select失敗:', error)
    alert(`selectエラー: ${error.message}`)
    return
  }

  if (!data) {
    console.log('🆕 ルームが存在しないので作成します')
    mySide = 'b'
    const initBoard = Array(9).fill(0).map(() => Array(9).fill(null))
    const insertData = {
      room,
      board: initBoard,
      turn: 'b',
      captured: { b: [], w: [] }
    }
    const { error: insertError } = await supabase.from('games').insert([insertData])
    if (insertError) {
      console.error('❌ insert失敗:', insertError)
      alert(`insertエラー: ${insertError.message}`)
      return
    }
    statusEl.textContent = 'あなたは先手です。相手を待っています。'
  } else {
    console.log('✅ 既存ルームに参加')
    mySide = 'w'
    statusEl.textContent = 'あなたは後手です。対局開始！'
    board = data.board
    turn = data.turn
    renderBoard()
  }

  subscribeGame()
}

// --- Realtime購読 ---
function subscribeGame() {
  console.log('📡 Realtime購読開始:', room)
  const channel = supabase
    .channel(`room:${room}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'games', filter: `room=eq.${room}` },
      payload => {
        console.log('📨 Realtime更新:', payload)
        if (payload.new) {
          board = payload.new.board
          turn = payload.new.turn
          renderBoard()
        }
      }
    )
    .subscribe(status => {
      console.log('🔔 購読ステータス:', status)
    })
}

// --- 盤面を描画 ---
function renderBoard() {
  boardEl.innerHTML = ''
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const cell = document.createElement('div')
      cell.className = 'cell'
      cell.textContent = board[r][c]?.type || ''
      cell.onclick = () => handleClick(r, c)
      boardEl.appendChild(cell)
    }
  }
}

// --- マスクリック（仮） ---
async function handleClick(r, c) {
  if (turn !== mySide) return
  console.log(`🖱️ ${r},${c} に ${mySide} が置こうとしています`)
  board[r][c] = { type: '歩', owner: mySide }
  turn = (turn === 'b' ? 'w' : 'b')

  const { error, status, data } = await supabase
    .from('games')
    .update({ board, turn })
    .eq('room', room)
    .select()
  
  console.log('📤 UPDATE結果:', { status, data, error })

  if (error) {
    console.error('❌ update失敗:', error)
    alert(`updateエラー: ${error.message}`)
  }
}
