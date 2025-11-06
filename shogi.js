
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'


// --- Supabase接続設定 ---
const SUPABASE_URL = 'https://tksriuqqarssyotmegmh.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRrc3JpdXFxYXJzc3lvdG1lZ21oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzOTU1NjAsImV4cCI6MjA3Nzk3MTU2MH0.ijlOfvZsLhnD3C2DmvNYjWHDjrHnhcAOYa3I2O7BDtk'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
// shogi.js — Supabase realtime + 完全ルール（持ち駒・二歩・打ち歩詰め 判定）
// 注: ブラウザ環境で動きます。Supabaseの anon key を使います。

// DOM
const boardEl = document.getElementById('board')
const joinBtn = document.getElementById('joinBtn')
const roomInput = document.getElementById('roomInput')
const statusEl = document.getElementById('status')
const capsBEl = document.getElementById('capsB')
const capsWEl = document.getElementById('capsW')
const turnText = document.getElementById('turnText')
const flipBtn = document.getElementById('flipBtn')
const resetRoomBtn = document.getElementById('resetRoomBtn')
const logEl = document.getElementById('log')
const resignBtn = document.getElementById('resignBtn')

function log(...args){ console.log(...args); logEl.innerText = ([...args].map(a => typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ')+ "\n" + logEl.innerText; }

// state
let room = ''
let mySide = null // 'b' or 'w'
let board = []    // 9x9 array of piece or null
let turn = 'b'
let caps = { b:{}, w:{} }
let selected = null
let selectedFromHand = null
let legalMoves = []
let viewFlipped = false
let channel = null

const kanji = { P:'歩', L:'香', N:'桂', S:'銀', G:'金', B:'角', R:'飛', K:'王' }

// ---------- board helpers & rules (based on previous full implementation) ----------
function initialBoard(){
  const b = Array.from({length:9}, ()=>Array(9).fill(null))
  const place = (r,c,t,o,p=false)=> b[r][c] = {type:t, owner:o, promoted:p}
  // 先手 b bottom (r=8)
  place(8,0,'L','b'); place(8,1,'N','b'); place(8,2,'S','b'); place(8,3,'G','b'); place(8,4,'K','b'); place(8,5,'G','b'); place(8,6,'S','b'); place(8,7,'N','b'); place(8,8,'L','b');
  place(7,1,'B','b'); place(7,7,'R','b'); for(let c=0;c<9;c++) place(6,c,'P','b');
  // 後手 w top
  place(0,0,'L','w'); place(0,1,'N','w'); place(0,2,'S','w'); place(0,3,'G','w'); place(0,4,'K','w'); place(0,5,'G','w'); place(0,6,'S','w'); place(0,7,'N','w'); place(0,8,'L','w');
  place(1,7,'B','w'); place(1,1,'R','w'); for(let c=0;c<9;c++) place(2,c,'P','w');
  return b;
}

function inBoard(r,c){ return r>=0 && r<9 && c>=0 && c<9 }
function copyPiece(p){ return p ? {type:p.type, owner:p.owner, promoted: !!p.promoted} : null }
function isEnemy(p, owner){ return p && p.owner !== owner }
function coordKey(r,c){ return `${r},${c}` }
function demoteCapturedPieceType(p){ return p ? p.type : null } // promoted pieces become base type on capture

function inPromotionZone(owner, r){ return owner==='b' ? r <= 2 : r >= 6 }
function canPromote(piece, fromR, toR){
  if(!piece) return false
  if(piece.type==='K' || piece.type==='G') return false
  return inPromotionZone(piece.owner, fromR) || inPromotionZone(piece.owner, toR)
}

// pseudo moves generator
function genMovesForPiece(r,c){
  const p = board[r][c]; if(!p) return []
  const owner = p.owner; const dir = owner==='b' ? -1 : 1
  const moves = []
  const add = (rr,cc)=>{ if(!inBoard(rr,cc)) return false; const t = board[rr][cc]; if(!t){ moves.push([rr,cc]); return true } if(isEnemy(t,owner)) moves.push([rr,cc]); return false }
  const slide = (dr,dc)=>{ let rr=r+dr, cc=c+dc; while(inBoard(rr,cc)){ if(!board[rr][cc]) moves.push([rr,cc]); else { if(isEnemy(board[rr][cc],owner)) moves.push([rr,cc]); break } rr+=dr; cc+=dc } }
  const type = p.type, prom = p.promoted
  if(type==='P' && !prom){ add(r+dir,c) }
  else if(type==='L' && !prom){ slide(dir,0) }
  else if(type==='N' && !prom){
    const rr = r + dir*2
    if(inBoard(rr,c-1) && (!board[rr][c-1] || isEnemy(board[rr][c-1],owner))) moves.push([rr,c-1])
    if(inBoard(rr,c+1) && (!board[rr][c+1] || isEnemy(board[rr][c+1],owner))) moves.push([rr,c+1])
  } else if(type==='S' && !prom){
    const deltas = [[dir,0],[dir,-1],[dir,1],[-dir,-1],[-dir,1]]
    deltas.forEach(([dr,dc])=>{ if(inBoard(r+dr,c+dc) && (!board[r+dr][c+dc] || isEnemy(board[r+dr][c+dc],owner))) moves.push([r+dr,c+dc]) })
  } else if(type==='G' || (prom && ['P','L','N','S'].includes(type))){
    const goldD = owner==='b' ? [[-1,0],[0,-1],[0,1],[1,0],[-1,-1],[-1,1]] : [[1,0],[0,-1],[0,1],[-1,0],[1,-1],[1,1]]
    goldD.forEach(([dr,dc])=>{ if(inBoard(r+dr,c+dc) && (!board[r+dr][c+dc] || isEnemy(board[r+dr][c+dc],owner))) moves.push([r+dr,c+dc]) })
  } else if(type==='K'){
    for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){ if(dr===0 && dc===0) continue; const rr=r+dr, cc=c+dc; if(inBoard(rr,cc) && (!board[rr][cc] || isEnemy(board[rr][cc],owner))) moves.push([rr,cc]) }
  } else if(type==='B'){
    slide(-1,-1); slide(-1,1); slide(1,-1); slide(1,1)
    if(prom){
      for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
        if(Math.abs(dr)===Math.abs(dc)) continue; if(dr===0 && dc===0) continue
        const rr=r+dr, cc=c+dc
        if(inBoard(rr,cc) && (!board[rr][cc] || isEnemy(board[rr][cc],owner))) moves.push([rr,cc])
      }
    }
  } else if(type==='R'){
    slide(-1,0); slide(1,0); slide(0,-1); slide(0,1)
    if(prom){
      for(let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++){
        if(Math.abs(dr)===Math.abs(dc) && dr!==0) {
          const rr=r+dr, cc=c+dc
          if(inBoard(rr,cc) && (!board[rr][cc] || isEnemy(board[rr][cc],owner))) moves.push([rr,cc])
        }
      }
    }
  }
  // uniq
  const set = new Set(), out=[]
  moves.forEach(m => { const k=coordKey(m[0],m[1]); if(!set.has(k)){ set.add(k); out.push(m) }})
  return out
}

function findKing(owner){
  for(let r=0;r<9;r++) for(let c=0;c<9;c++){ const p = board[r][c]; if(p && p.type==='K' && p.owner===owner) return [r,c] }
  return null
}

function isInCheck(owner){
  const k = findKing(owner); if(!k) return false
  const [kr,kc] = k
  for(let r=0;r<9;r++) for(let c=0;c<9;c++){ const p=board[r][c]; if(!p || p.owner===owner) continue; const ms=genMovesForPiece(r,c); if(ms.some(m=>m[0]===kr && m[1]===kc)) return true }
  return false
}

// generate pseudo moves including drops
function genAllPseudoMoves(owner){
  const moves=[]
  for(let r=0;r<9;r++) for(let c=0;c<9;c++){
    const p = board[r][c]; if(!p || p.owner!==owner) continue
    const ms = genMovesForPiece(r,c); ms.forEach(m=> moves.push({from:[r,c], to:m, dropType:null}))
  }
  // drops
  const hand = caps[owner] || {}
  for(const type in hand){
    const count = hand[type]
    if(!count || count<=0) continue
    for(let r=0;r<9;r++) for(let c=0;c<9;c++){
      if(board[r][c]) continue
      // pawn can't drop on final rank, knight can't drop on last two ranks
      if(type==='P'){ if(owner==='b' && r===0) continue; if(owner==='w' && r===8) continue
        // nifu check
        let hasPawn=false
        for(let rr=0; rr<9; rr++){ const q = board[rr][c]; if(q && q.owner===owner && q.type==='P' && !q.promoted){ hasPawn=true; break } }
        if(hasPawn) continue
      }
      if(type==='N'){ if(owner==='b' && r<=1) continue; if(owner==='w' && r>=7) continue }
      moves.push({from:null, to:[r,c], dropType:type})
    }
  }
  return moves
}

// generate legal moves (no leaving own king in check, and block uchifu)
function genAllLegalMoves(owner){
  const pseudo = genAllPseudoMoves(owner)
  const legal=[]
  for(const mv of pseudo){
    // simulate
    const savedFrom = mv.from ? copyPiece(board[mv.from[0]][mv.from[1]]) : null
    const savedTo = copyPiece(board[mv.to[0]][mv.to[1]])
    if(mv.from){
      board[mv.to[0]][mv.to[1]] = copyPiece(board[mv.from[0]][mv.from[1]])
      board[mv.from[0]][mv.from[1]] = null
    } else {
      board[mv.to[0]][mv.to[1]] = { type: mv.dropType, owner: owner, promoted:false }
      caps[owner][mv.dropType]--
    }

    let illegal = false
    // if drop pawn, detect uchifu-zume (打ち歩詰め) — if drop gives check and opponent has no legal responses -> illegal
    if(mv.dropType === 'P'){
      const opp = owner==='b' ? 'w' : 'b'
      if(isInCheck(opp)){
        const oppLegal = genAllLegalResponsesForPosition(opp)
        if(oppLegal.length === 0) illegal = true
      }
    }
    if(isInCheck(owner)) illegal = true

    // restore
    if(mv.from){
      board[mv.from[0]][mv.from[1]] = savedFrom
      board[mv.to[0]][mv.to[1]] = savedTo
    } else {
      board[mv.to[0]][mv.to[1]] = savedTo
      caps[owner][mv.dropType]++
    }

    if(!illegal) legal.push(mv)
  }
  return legal
}

// opponent legal responses generator (used for uchifu detection)
function genAllLegalResponsesForPosition(owner){
  const pseudo=[]
  for(let r=0;r<9;r++) for(let c=0;c<9;c++){
    const p = board[r][c]
    if(!p || p.owner!==owner) continue
    const ms = genMovesForPiece(r,c); ms.forEach(m=> pseudo.push({from:[r,c], to:m, dropType:null}))
  }
  const hand = caps[owner] || {}
  for(const type in hand){
    const count = hand[type]
    if(!count || count<=0) continue
    for(let r=0;r<9;r++) for(let c=0;c<9;c++){
      if(board[r][c]) continue
      if(type==='P'){ if(owner==='b' && r===0) continue; if(owner==='w' && r===8) continue
        let hasPawn=false; for(let rr=0; rr<9; rr++){ const q = board[rr][c]; if(q && q.owner===owner && q.type==='P' && !q.promoted){ hasPawn=true; break } } if(hasPawn) continue
      }
      if(type==='N'){ if(owner==='b' && r<=1) continue; if(owner==='w' && r>=7) continue }
      pseudo.push({from:null, to:[r,c], dropType:type})
    }
  }
  // filter king safety
  const legal=[]
  for(const mv of pseudo){
    const savedFrom = mv.from ? copyPiece(board[mv.from[0]][mv.from[1]]) : null
    const savedTo = copyPiece(board[mv.to[0]][mv.to[1]])
    if(mv.from){
      board[mv.to[0]][mv.to[1]] = copyPiece(board[mv.from[0]][mv.from[1]])
      board[mv.from[0]][mv.from[1]] = null
    } else {
      board[mv.to[0]][mv.to[1]] = { type: mv.dropType, owner: owner, promoted:false }; caps[owner][mv.dropType]--
    }
    const illegal = isInCheck(owner)
    if(mv.from){
      board[mv.from[0]][mv.from[1]] = savedFrom; board[mv.to[0]][mv.to[1]] = savedTo
    } else { board[mv.to[0]][mv.to[1]] = savedTo; caps[owner][mv.dropType]++ }
    if(!illegal) legal.push(mv)
  }
  return legal
}

// execute validated move object (mv)
function applyMove(mv){
  if(mv.from){
    const fr=mv.from[0], fc=mv.from[1], tr=mv.to[0], tc=mv.to[1]
    const mover = board[fr][fc]; const target = board[tr][tc]
    if(target){
      const capType = demoteCapturedPieceType(target)
      if(!caps[turn][capType]) caps[turn][capType]=0
      caps[turn][capType]++
    }
    board[tr][tc] = copyPiece(mover); board[fr][fc] = null
    // promotion
    if(canPromote(mover, fr, tr)){
      let mustPromote=false
      if(mover.type==='P' && ((turn==='b' && tr===0) || (turn==='w' && tr===8))) mustPromote=true
      if(mover.type==='L' && ((turn==='b' && tr===0) || (turn==='w' && tr===8))) mustPromote=true
      if(mover.type==='N' && ((turn==='b' && tr<=1) || (turn==='w' && tr>=7))) mustPromote=true
      if(mustPromote) board[tr][tc].promoted = true
      else {
        if(confirm('成りますか？ OK=成る / キャンセル=成らない')) board[tr][tc].promoted = true
      }
    }
  } else {
    const tr=mv.to[0], tc=mv.to[1]
    board[tr][tc] = { type: mv.dropType, owner: turn, promoted:false }
    caps[turn][mv.dropType]-- // assumes exist
  }
  // flip turn
  turn = (turn==='b' ? 'w' : 'b')
}

// ---------- UI rendering ----------
function render(){
  boardEl.innerHTML=''
  const rows = viewFlipped ? [...Array(9).keys()].reverse() : [...Array(9).keys()]
  const cols = viewFlipped ? [...Array(9).keys()].reverse() : [...Array(9).keys()]
  for(const r of rows){
    for(const c of cols){
      const cell = document.createElement('div'); cell.className='cell'; if((r+c)%2===1) cell.classList.add('dark')
      cell.dataset.r=r; cell.dataset.c=c
      // highlight
      if(selected){
        if(legalMoves.find(m=> m.from && m.from[0]===selected[0] && m.from[1]===selected[1] && m.to[0]===r && m.to[1]===c)) cell.classList.add('highlight')
      } else if(selectedFromHand){
        if(legalMoves.find(m=> m.from===null && m.dropType===selectedFromHand.type && m.to[0]===r && m.to[1]===c)) cell.classList.add('highlight')
      }
      const p = board[r][c]
      if(p){
        const piece = document.createElement('div'); piece.className='piece ' + (p.owner==='b' ? 'black' : 'white'); piece.textContent = (p.promoted ? '成' : '') + (kanji[p.type]||'?')
        if(selected && selected[0]==r && selected[1]==c) piece.classList.add('selected')
        cell.appendChild(piece)
      }
      cell.addEventListener('click', onCellClick)
      boardEl.appendChild(cell)
    }
  }
  renderCaps()
  turnText.textContent = (turn==='b' ? '先手の手番' : '後手の手番')
  statusEl.textContent = `あなた: ${mySide || '-'} / ルーム: ${room || '-'}`
}

function renderCaps(){
  capsBEl.innerHTML=''; capsWEl.innerHTML=''
  const types = ['P','L','N','S','G','B','R']
  for(const t of types){
    const n = caps.b[t] || 0
    if(n>0){
      const btn = createCapBtn('b', t, n); capsBEl.appendChild(btn)
    }
  }
  for(const t of types){
    const n = caps.w[t] || 0
    if(n>0){
      const btn = createCapBtn('w', t, n); capsWEl.appendChild(btn)
    }
  }
}

function createCapBtn(owner, type, count){
  const btn = document.createElement('div'); btn.className='cap-btn'; btn.dataset.owner=owner; btn.dataset.type=type
  btn.innerHTML = `<div style="width:18px;text-align:center;font-weight:700;">${kanji[type]}</div><div class="cap-count">${count}</div>`
  btn.addEventListener('click', ()=>{
    if(turn !== owner){ alert('自分の手番のときのみ持ち駒を選べます'); return }
    selected = null; selectedFromHand = { type, owner }; legalMoves = genAllLegalMoves(owner).filter(m => m.from===null && m.dropType===type)
    render(); log('持ち駒選択', type, '候補数', legalMoves.length)
  })
  return btn
}

// ---------- input handling ----------
function onCellClick(e){
  const r = parseInt(e.currentTarget.dataset.r,10), c = parseInt(e.currentTarget.dataset.c,10)
  const p = board[r][c]
  // if selecting from hand -> attempt drop
  if(selectedFromHand){
    const legal = genAllLegalMoves(turn).filter(m => m.from===null && m.dropType===selectedFromHand.type && m.to[0]===r && m.to[1]===c)
    if(legal.length===0){ alert('ここには打てません（ルール違反）'); return }
    applyMove(legal[0]); sendUpdate(); return
  }
  // if a piece selected and clicked legal dest
  if(selected){
    const mv = legalMoves.find(m => m.from && m.from[0]===selected[0] && m.from[1]===selected[1] && m.to[0]===r && m.to[1]===c)
    if(mv){ applyMove(mv); sendUpdate(); return }
    if(p && p.owner===turn){ selected=[r,c]; legalMoves = genAllLegalMoves(turn).filter(m=> m.from && m.from[0]===r && m.from[1]===c); selectedFromHand=null; render(); return }
    selected = null; legalMoves=[]; selectedFromHand=null; render(); return
  }
  // no selection: select piece if it's player's piece
  if(p && p.owner === turn){
    selected=[r,c]; legalMoves = genAllLegalMoves(turn).filter(m=> m.from && m.from[0]===r && m.from[1]===c); selectedFromHand=null; render(); return
  }
  // else nothing
}

// ---------- Supabase: room join / realtime ----------
joinBtn.addEventListener('click', async ()=>{
  room = roomInput.value.trim(); if(!room){ alert('ルーム名を入力'); return }
  log('ルーム参加:', room)
  // try to fetch (maybeSingle) — if no room, create with upsert to avoid duplicates
  const { data, error } = await supabase.from('games').select('*').eq('room', room).maybeSingle()
  log('SELECT', { data, error })
  if(error){ alert('select failed:' + error.message); return }
  if(!data){
    // create new room with initial state using upsert (onConflict room)
    board = initialBoard()
    turn = 'b'
    caps = { b:{}, w:{} }
    const payload = { room, board, turn, captured: caps }
    const { error: insErr } = await supabase.from('games').upsert([payload], { onConflict: 'room' })
    if(insErr){ alert('room create failed: '+insErr.message); return }
    mySide = 'b'; log('ルーム作成完了')
  } else {
    // join existing
    board = data.board; turn = data.turn; caps = data.captured || { b:{}, w:{} }; mySide = (data.turn==='b' ? 'w' : 'b') // if turn is b, the joiner becomes w; simple heuristic
    log('ルーム参加: 既存データ読み込み', { board, turn, caps })
  }
  // subscribe realtime
  subscribe()
  render()
})

// manual reset room (dev)
resetRoomBtn.addEventListener('click', async ()=>{
  if(!room){ alert('先にルームに参加してください'); return }
  if(!confirm('このルームの盤面を初期化しますか？')) return
  board = initialBoard(); turn='b'; caps={ b:{}, w:{} }
  const { error } = await supabase.from('games').update({ board, turn, captured: caps }).eq('room', room)
  if(error) alert('reset failed: '+error.message); else log('room reset')
  render()
})

flipBtn.addEventListener('click', ()=>{ viewFlipped = !viewFlipped; render() })
resignBtn.addEventListener('click', async ()=>{ if(!room) return; if(!confirm('投了しますか？')) return; const winner = (mySide==='b' ? 'w' : 'b'); await supabase.from('games').update({ status:`resigned:${mySide}`, winner }).eq('room', room); log('投了送信') })

function subscribe(){
  if(channel){ try{ channel.unsubscribe() }catch(e){} channel=null }
  channel = supabase.channel(`room:${room}`)
  channel.on('postgres_changes', { event:'*', schema:'public', table:'games', filter:`room=eq.${room}` }, payload=>{
    log('Realtime payload', payload)
    if(payload.new){
      // take newest state
      board = payload.new.board || board
      turn = payload.new.turn || turn
      caps = payload.new.captured || caps
      render()
    }
  }).subscribe(status=>{
    log('subscribe status', status)
  })
}

// ---------- send updates to supabase (atomic) ----------
async function sendUpdate(){
  // push to supabase (update by room). Use update ... returning * via .select()
  const payload = { board, turn, captured: caps }
  const { data, error } = await supabase.from('games').update(payload).eq('room', room).select().maybeSingle()
  if(error){ alert('update error: '+error.message); log('update error', error) }
  else log('update ok', data)
  // reset UI selections
  selected = null; selectedFromHand = null; legalMoves = []
  render()
}

// ---------- initialization ----------
board = initialBoard()
turn = 'b'
caps = { b:{}, w:{} }
render()
log('ready — Supabase URL must be configured in shogi.js')

