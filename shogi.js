import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Supabase接続設定
const SUPABASE_URL = 'https://tksriuqqarssyotmegmh.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRrc3JpdXFxYXJzc3lvdG1lZ21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzOTU1NjAsImV4cCI6MjA3Nzk3MTU2MH0.ijlOfvZsLhnD3C2DmvNYjWHDjrHnhcAOYa3I2O7BDtk'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

const boardEl = document.getElementById('board')
const joinBtn = document.getElementById('joinBtn')
const roomInput = document.getElementById('roomInput')
const statusEl = document.getElementById('status')

let board = []      // 盤面データ
let turn = 'b'
let room = ''
let mySide = null

joinBtn.onclick = async () => {
  room = roomInput.value.trim()
  if (!room) return alert('ルーム名を入力してください')

  const { data } = await supabase
    .from('games')
    .select('*')
    .eq('room', room)
    .single()

  if (!data) {
    // ルームがなければ作る（先手）
    mySide = 'b'
    const initBoard = Array(9).fill(0).map(()=>Array(9).fill(null))
    await supabase.from('games').insert([{ room, board:initBoard, turn:'b', captured:{b:[], w:[]} }])
    statusEl.textContent = 'あなたは先手です。相手を待っています。'
  } else {
    mySide = 'w'
    statusEl.textContent = 'あなたは後手です。対局開始！'
  }

  subscribeGame()
}

// Realtime購読
function subscribeGame(){
  supabase
    .channel(`room:${room}`)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'games', filter: `room=eq.${room}` },
      payload => {
        const newGame = payload.new
        board = newGame.board
        turn = newGame.turn
        renderBoard()
      }
    )
    .subscribe()
}

// 盤面を描画（例では簡略表示）
function renderBoard(){
  boardEl.innerHTML = ''
  for(let r=0;r<9;r++){
    for(let c=0;c<9;c++){
      const cell = document.createElement('div')
      cell.className = 'cell'
      cell.textContent = board[r][c]?.type || ''
      cell.onclick = ()=>handleClick(r,c)
      boardEl.appendChild(cell)
    }
  }
}

// 移動処理（ここに成り・二歩・持ち駒判定など実装可能）
async function handleClick(r,c){
  if(turn !== mySide) return
  // 仮の例：クリックしたマスに歩を置く
  board[r][c] = {type:'歩', owner:mySide}
  turn = (turn==='b' ? 'w' : 'b')
  await supabase.from('games').update({ board, turn }).eq('room', room)
}
