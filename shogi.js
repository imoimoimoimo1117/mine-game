// shogi.js (Auth + Moves + Full rules + Realtime)
// 必ず書き換えてください:
const SUPABASE_URL = 'https://YOUR-PROJECT.supabase.co'
const SUPABASE_KEY = 'YOUR-ANON-KEY'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

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
const movesList = document.getElementById('movesList')
const replayBtn = document.getElementById('replayBtn')
const resignBtn = document.getElementById('resignBtn')

// auth DOM
const emailInput = document.getElementById('emailInput')
const signInBtn = document.getElementById('signInBtn')
const signOutBtn = document.getElementById('signOutBtn')
const meEl = document.getElementById('me')

function log(...args){ console.log(...args); logEl.innerText = ([...args].map(a => typeof a==='object' ? JSON.stringify(a) : String(a))).join(' ') + '\n' + logEl.innerText; }

// state
let room = ''
let mySide = null
let myUser = null
let board = []
let turn = 'b'
let caps = { b:{}, w:{} }
let selected = null
let selectedFromHand = null
let legalMoves = []
let viewFlipped = false
let channel = null
let currentGameId = null

const kanji = { P:'歩', L:'香', N:'桂', S:'銀', G:'金', B:'角', R:'飛', K:'王' }

// ---------- rules & utility (same as earlier full impl) ----------
function initialBoard(){
  const b = Array.from({length:9}, ()=>Array(9).fill(null))
  const place = (r,c,t,o,p=false)=> b[r][c] = {type:t, owner:o, promoted:p}
  place(8,0,'L','b'); place(8,1,'N','b'); place(8,2,'S','b'); place(8,3,'G','b'); place(8,4,'K','b'); place(8,5,'G','b'); place(8,6,'S','b'); place(8,7,'N','b'); place(8,8,'L','b');
  place(7,1,'B','b'); place(7,7,'R','b'); for(let c=0;c<9;c++) place(6,c,'P','b');
  place(0,0,'L','w'); place(0,1,'N','w'); place(0,2,'S','w'); place(0,3,'G','w'); place(0,4,'K','w'); place(0,5,'G','w'); place(0,6,'S','w'); place(0,7,'N','w'); place(0,8,'L','w');
  place(1,7,'B','w'); place(1,1,'R','w'); for(let c=0;c<9;c++) place(2,c,'P','w');
  return b;
}
function inBoard(r,c){ return r>=0 && r<9 && c>=0 && c<9 }
function copyPiece(p){ return p ? {type:p.type, owner:p.owner, promoted: !!p.promoted} : null }
function isEnemy(p, owner){ return p && p.owner !== owner }
function coordKey(r,c){ return `${r},${c}` }
function demoteCapturedPieceType(p){ return p ? p.type : null }
function inPromotionZone(owner, r){ return owner==='b' ? r <= 2 : r >= 6 }
function canPromote(piece, fromR, toR){ if(!piece) return false; if(piece.type==='K' || piece.type==='G') return false; return inPromotionZone(piece.owner, fromR) || inPromotionZone(piece.owner, toR) }

// genMovesForPiece, genAllPseudoMoves, genAllLegalMoves, isInCheck, genAllLegalResponsesForPosition, applyMove
// (To keep this message focused, we will reuse the earlier full implementation code blocks.
// Paste the full implementations from the previously provided "full rules" shogi.js for these functions
// — they are unchanged. For brevity in this message I assume those functions (genMovesForPiece, genAllLegalMoves, isInCheck, applyMove, etc.) are present here exactly as in the full rules file.)
//
// *** IMPORTANT: In your local file, copy the full implementations for:
// genMovesForPiece, genAllPseudoMoves, genAllLegalMoves, genAllLegalResponsesForPosition, isInCheck, applyMove
// from the "完全版 shogi.js" you already have. ***
/* ----- INSERT FULL RULES IMPLEMENTATION HERE (genMovesForPiece ... applyMove) ----- */

// For the sake of space in this message we will include them now:
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
  const set = new Set(), out=[]
  moves.forEach(m => { const k=coordKey(m[0],m[1]); if(!set.has(k)){ set.add(k); out.push(m) }})
  return out
}

function findKing(owner){
  for(let r=0;r<9;r++) for(let c=0;c<9;c++){ const p=board[r][c]; if(p && p.type==='K' && p.owner===owner) return [r,c] }
  return null
}

function isInCheck(owner){
  const k = findKing(owner); if(!k) return false
  const [kr,kc] = k
  for(let r=0;r<9;r++) for(let c=0;c<9;c++){ const p=board[r][c]; if(!p || p.owner===owner) continue; const ms=genMovesForPiece(r,c); if(ms.some(m=>m[0]===kr && m[1]===kc)) return true }
  return false
}

function genAllPseudoMoves(owner){
  const moves=[]
  for(let r=0;r<9;r++) for(let c=0;c<9;c++){
    const p = board[r][c]; if(!p || p.owner!==owner) continue
    const ms = genMovesForPiece(r,c); ms.forEach(m=> moves.push({from:[r,c], to:m, dropType:null}))
  }
  const hand = caps[owner] || {}
  for(const type in hand){
    const count = hand[type]
    if(!count || count<=0) continue
    for(let r=0;r<9;r++) for(let c=0;c<9;c++){
      if(board[r][c]) continue
      if(type==='P'){ if(owner==='b' && r===0) continue; if(owner==='w' && r===8) continue
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

function genAllLegalResponsesForPosition(owner){
  const pseudo=[]
  for(let r=0;r<9;r++) for(let c=0;c<9;c++){
    const p=board[r][c]; if(!p || p.owner!==owner) continue
    const ms=genMovesForPiece(r,c); ms.forEach(m=> pseudo.push({from:[r,c], to:m, dropType:null}))
  }
  const hand = caps[owner] || {}
  for(const type in hand){
    const count = hand[type]; if(!count || count<=0) continue
    for(let r=0;r<9;r++) for(let c=0;c<9;c++){
      if(board[r][c]) continue
      if(type==='P'){ if(owner==='b' && r===0) continue; if(owner==='w' && r===8) continue
        let hasPawn=false; for(let rr=0; rr<9; rr++){ const q = board[rr][c]; if(q && q.owner===owner && q.type==='P' && !q.promoted){ hasPawn=true; break } } if(hasPawn) continue
      }
      if(type==='N'){ if(owner==='b' && r<=1) continue; if(owner==='w' && r>=7) continue }
      pseudo.push({from:null, to:[r,c], dropType:type})
    }
  }
  const legal=[]
  for(const mv of pseudo){
    const savedFrom = mv.from ? copyPiece(board[mv.from[0]][mv.from[1]]) : null
    const savedTo = copyPiece(board[mv.to[0]][mv.to[1]])
    if(mv.from){ board[mv.to[0]][mv.to[1]] = copyPiece(board[mv.from[0]][mv.from[1]]); board[mv.from[0]][mv.from[1]] = null }
    else { board[mv.to[0]][mv.to[1]] = { type: mv.dropType, owner: owner, promoted:false }; caps[owner][mv.dropType]-- }
    const illegal = isInCheck(owner)
    if(mv.from){ board[mv.from[0]][mv.from[1]] = savedFrom; board[mv.to[0]][mv.to[1]] = savedTo }
    else { board[mv.to[0]][mv.to[1]] = savedTo; caps[owner][mv.dropType]++ }
    if(!illegal) legal.push(mv)
  }
  return legal
}

function genAllLegalMoves(owner){
  const pseudo = genAllPseudoMoves(owner)
  const legal=[]
  for(const mv of pseudo){
    const savedFrom = mv.from ? copyPiece(board[mv.from[0]][mv.from[1]]) : null
    const savedTo = copyPiece(board[mv.to[0]][mv.to[1]])
    if(mv.from){ board[mv.to[0]][mv.to[1]] = copyPiece(board[mv.from[0]][mv.from[1]]); board[mv.from[0]][mv.from[1]] = null }
    else { board[mv.to[0]][mv.to[1]] = { type: mv.dropType, owner: owner, promoted:false }; caps[owner][mv.dropType]-- }
    let illegal = false
    if(mv.dropType === 'P'){
      const opp = owner==='b' ? 'w' : 'b'
      if(isInCheck(opp)){
        const oppLegal = genAllLegalResponsesForPosition(opp)
        if(oppLegal.length === 0) illegal = true
      }
    }
    if(isInCheck(owner)) illegal = true
    if(mv.from){ board[mv.from[0]][mv.from[1]] = savedFrom; board[mv.to[0]][mv.to[1]] = savedTo }
    else { board[mv.to[0]][mv.to[1]] = savedTo; caps[owner][mv.dropType]++ }
    if(!illegal) legal.push(mv)
  }
  return legal
}

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
    if(canPromote(mover, fr, tr)){
      let mustPromote=false
      if(mover.type==='P' && ((turn==='b' && tr===0) || (turn==='w' && tr===8))) mustPromote=true
      if(mover.type==='L' && ((turn==='b' && tr===0) || (turn==='w' && tr===8))) mustPromote=true
      if(mover.type==='N' && ((turn==='b' && tr<=1) || (turn==='w' && tr>=7))) mustPromote=true
      if(mustPromote) board[tr][tc].promoted = true
      else { if(confirm('成りますか？ OK=成る / キャンセル=成らない')) board[tr][tc].promoted = true }
    }
  } else {
    const tr=mv.to[0], tc=mv.to[1]
    board[tr][tc] = { type: mv.dropType, owner: turn, promoted:false }
    caps[turn][mv.dropType]--
  }
  turn = (turn==='b' ? 'w' : 'b')
}

// ---------- rendering ----------
function render(){
  boardEl.innerHTML = ''
  const rows = viewFlipped ? [...Array(9).keys()].reverse() : [...Array(9).keys()]
  const cols = viewFlipped ? [...Array(9).keys()].reverse() : [...Array(9).keys()]
  for(const r of rows){
    for(const c of cols){
      const cell = document.createElement('div'); cell.className='cell'; if((r+c)%2===1) cell.classList.add('dark')
      cell.dataset.r = r; cell.dataset.c = c
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
  statusEl.textContent = `あなた: ${myUser?.email || '未ログイン'} / ルーム: ${room || '-'}`
  renderMovesList()
}

function renderCaps(){
  capsBEl.innerHTML=''; capsWEl.innerHTML=''
  const types = ['P','L','N','S','G','B','R']
  for(const t of types){
    const n = caps.b[t] || 0
    if(n>0){ const btn = createCapBtn('b', t, n); capsBEl.appendChild(btn) }
  }
  for(const t of types){
    const n = caps.w[t] || 0
    if(n>0){ const btn = createCapBtn('w', t, n); capsWEl.appendChild(btn) }
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
  if(selectedFromHand){
    const legal = genAllLegalMoves(turn).filter(m => m.from===null && m.dropType===selectedFromHand.type && m.to[0]===r && m.to[1]===c)
    if(legal.length===0){ alert('ここには打てません（ルール違反）'); return }
    const mv = legal[0]; applyMove(mv); awaitAndSaveMove(mv); return
  }
  if(selected){
    const mv = legalMoves.find(m => m.from && m.from[0]===selected[0] && m.from[1]===selected[1] && m.to[0]===r && m.to[1]===c)
    if(mv){ applyMove(mv); awaitAndSaveMove(mv); return }
    if(p && p.owner===turn){ selected=[r,c]; legalMoves = genAllLegalMoves(turn).filter(m=> m.from && m.from[0]===r && m.from[1]===c); selectedFromHand=null; render(); return }
    selected = null; legalMoves=[]; selectedFromHand=null; render(); return
  }
  if(p && p.owner === turn){
    selected=[r,c]; legalMoves = genAllLegalMoves(turn).filter(m=> m.from && m.from[0]===r && m.from[1]===c); selectedFromHand=null; render(); return
  }
}

// ---------- Supabase realtime / room join / create / update ----------
async function ensureGameExistsAndGet(roomName){
  // upsert to ensure a single row and get id
  const initial = { room: roomName, board: initialBoard(), turn:'b', captured: { b:{}, w:{} } }
  const { data, error } = await supabase.from('games').upsert([initial], { onConflict: 'room' }).select().maybeSingle()
  if(error) { throw error }
  return data
}

async function joinRoom(){
  if(!myUser){ alert('まずサインインしてください（メール）'); return }
  room = roomInput.value.trim(); if(!room){ alert('ルーム名を入力'); return }
  log('joining room', room)
  try {
    const game = await ensureGameExistsAndGet(room)
    currentGameId = game.id
    // set local state from DB
    board = game.board || initialBoard()
    turn = game.turn || 'b'
    caps = game.captured || { b:{}, w:{} }
    // assign sides: first creator is b; if no players registered, first joiner should be b; second is w
    // here we simply let joining client choose side if not set. For more robust assignment use players table.
    mySide = (mySide || null)
    subscribeRealtime()
    render()
    log('joined', currentGameId)
  } catch(err){
    alert('join error: '+ err.message); log('join error', err)
  }
}

joinBtn.addEventListener('click', joinRoom)

function subscribeRealtime(){
  if(channel){ try{ channel.unsubscribe() }catch(e){} channel=null }
  channel = supabase.channel(`room:${room}`)
  channel.on('postgres_changes', { event:'*', schema:'public', table:'games', filter:`room=eq.${room}` }, payload=>{
    log('realtime payload', payload)
    if(payload.new){
      board = payload.new.board || board
      turn = payload.new.turn || turn
      caps = payload.new.captured || caps
      render()
    }
  }).subscribe(status => log('sub status', status))
}

resetRoomBtn.addEventListener('click', async ()=>{
  if(!room) return alert('先にルーム参加')
  if(!confirm('ルームを初期化しますか？棋譜も消えます')) return
  board = initialBoard(); turn = 'b'; caps = { b:{}, w:{} }
  await supabase.from('games').update({ board, turn, captured: caps }).eq('room', room)
  // delete moves
  await supabase.from('moves').delete().eq('game_id', currentGameId)
  render(); log('room reset')
})

// ---------- save moves to moves table and update game row ----------
async function awaitAndSaveMove(mv){
  // prepare move record. Determine move_no
  try{
    // get current max move_no
    const { data: last, error: e1 } = await supabase.from('moves').select('move_no').eq('game_id', currentGameId).order('move_no',{ascending:false}).limit(1).maybeSingle()
    if(e1) throw e1
    const nextNo = last ? (last.move_no + 1) : 1
    const rec = {
      game_id: currentGameId,
      move_no: nextNo,
      player: (turn==='b' ? 'w' : 'b'), // note: applyMove already flipped turn, so player who moved is opposite of current turn
      from_pos: mv.from ? coordKey(mv.from[0], mv.from[1]) : null,
      to_pos: coordKey(mv.to[0], mv.to[1]),
      piece: mv.from ? board[mv.to[0]][mv.to[1]].type : mv.dropType,
      promoted: mv.from ? !!board[mv.to[0]][mv.to[1]].promoted : false,
      drop: mv.from ? false : true
    }
    // update games row and insert move in a simple sequence (no transaction available from client)
    const { error: e2 } = await supabase.from('moves').insert([rec])
    if(e2) throw e2
    const payload = { board, turn, captured: caps }
    const { error: e3 } = await supabase.from('games').update(payload).eq('id', currentGameId)
    if(e3) throw e3
    render(); log('move saved', rec)
  } catch(err){
    alert('move save failed: '+ err.message); log('move save failed', err)
  }
}

// ---------- display moves list ----------
async function renderMovesList(){
  if(!currentGameId){ movesList.innerText = ''; return }
  const { data, error } = await supabase.from('moves').select('*').eq('game_id', currentGameId).order('move_no',{ascending:true})
  if(error){ log('moves fetch err', error); movesList.innerText='(error)'; return }
  const lines = data.map(m => `${m.move_no}. ${m.player} ${m.from_pos || '(drop)'}->${m.to_pos} ${m.piece}${m.promoted?'(成)':''}${m.drop?' (打)':''}`)
  movesList.innerText = lines.join('\n')
}

// ---------- replay / rewind ----------
replayBtn.addEventListener('click', async ()=>{
  if(!currentGameId) return alert('先にルーム参加')
  // fetch initial board and moves
  const { data: game } = await supabase.from('games').select('*').eq('id', currentGameId).maybeSingle()
  if(!game) return alert('game not found')
  const { data: moves } = await supabase.from('moves').select('*').eq('game_id', currentGameId).order('move_no',{ascending:true})
  // reset UI
  let tempBoard = initialBoard(), tempCaps = { b:{}, w:{} }, tempTurn = 'b'
  board = tempBoard; caps = tempCaps; turn = tempTurn; render()
  // play moves sequentially with small delay
  for(const m of moves){
    await new Promise(res => setTimeout(res, 350))
    // parse move to apply
    const mv = {}
    if(m.drop){
      const [r,c] = m.to_pos.split(',').map(Number)
      mv.from = null; mv.to = [r,c]; mv.dropType = m.piece
      // apply to board
      board[mv.to[0]][mv.to[1]] = { type: mv.dropType, owner: m.player, promoted: false }
    } else {
      const fr = m.from_pos.split(',').map(Number); const tr = m.to_pos.split(',').map(Number)
      mv.from = fr; mv.to = tr
      // naive apply (not handling promotions here exactly); we set piece type
      board[mv.to[0]][mv.to[1]] = { type: m.piece, owner: m.player, promoted: m.promoted }
      board[mv.from[0]][mv.from[1]] = null
    }
    turn = (turn==='b' ? 'w' : 'b')
    render()
  }
  log('replay finished')
})

// ---------- resign / sign in / sign out ----------
resignBtn.addEventListener('click', async ()=>{
  if(!room) return
  if(!confirm('本当に投了しますか？')) return
  const winner = mySide === 'b' ? 'w' : 'b'
  await supabase.from('games').update({ status: 'resigned', winner }).eq('id', currentGameId)
})

signInBtn.addEventListener('click', async ()=>{
  const email = emailInput.value.trim()
  if(!email) return alert('メールアドレスを入力')
  const { data, error } = await supabase.auth.signInWithOtp({ email })
  if(error) return alert('サインインエラー: '+error.message)
  alert('メールを確認してログインしてください（Magic Link）')
})

signOutBtn.addEventListener('click', async ()=>{
  await supabase.auth.signOut()
  myUser = null; meEl.innerText = ''
  signOutBtn.style.display = 'none'
  signInBtn.style.display = 'inline-block'
})

supabase.auth.onAuthStateChange((event, session) => {
  myUser = session?.user ?? null
  if(myUser){
    meEl.innerText = myUser.email || myUser.id
    signOutBtn.style.display = 'inline-block'
    signInBtn.style.display = 'none'
    log('auth state', event, myUser)
  } else {
    meEl.innerText = '未ログイン'
    signOutBtn.style.display = 'none'
    signInBtn.style.display = 'inline-block'
  }
})

// ---------- init ----------
board = initialBoard(); caps = { b:{}, w:{} }; turn = 'b'; render()
log('Ready — Supabase URL/KEY must be configured in shogi.js')

