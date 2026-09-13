const ROOM_CODE_PATTERN = /^[A-Z0-9]{4,6}$/;
const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O or 1/I - easy to misread aloud

const nameInput = document.getElementById('display-name');
const nameError = document.getElementById('name-error');
const createBtn = document.getElementById('create-room-btn');
const codeInput = document.getElementById('room-code-input');
const codeError = document.getElementById('code-error');
const joinBtn = document.getElementById('join-room-btn');
const joinError = document.getElementById('join-error');

// A room.js redirect back here (room not found, duplicate name, room
// full, round already started) stashes its message in sessionStorage
// before navigating, since the WebSocket that reported it is already gone
// by the time this page loads.
const storedJoinError = sessionStorage.getItem('joinError');
if (storedJoinError) {
  sessionStorage.removeItem('joinError');
  joinError.textContent = storedJoinError;
  joinError.hidden = false;
}

function getTrimmedName() {
  return nameInput.value.trim();
}

function requireName() {
  const name = getTrimmedName();
  if (!name) {
    nameError.hidden = false;
    nameInput.focus();
    return null;
  }
  nameError.hidden = true;
  return name;
}

function generateRoomCode() {
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

function goToRoom(code, name, isCreator) {
  sessionStorage.setItem('displayName', name);
  sessionStorage.setItem('isCreator', isCreator ? 'true' : 'false');
  window.location.href = `/room/${code}`;
}

createBtn.addEventListener('click', () => {
  joinError.hidden = true;
  const name = requireName();
  if (!name) return;
  goToRoom(generateRoomCode(), name, true);
});

joinBtn.addEventListener('click', () => {
  joinError.hidden = true;
  const name = requireName();
  if (!name) return;

  const code = codeInput.value.trim().toUpperCase();
  if (!ROOM_CODE_PATTERN.test(code)) {
    codeError.hidden = false;
    codeInput.focus();
    return;
  }
  codeError.hidden = true;
  goToRoom(code, name, false);
});

[nameInput, codeInput].forEach((input) => {
  input.addEventListener('input', () => {
    nameError.hidden = true;
    codeError.hidden = true;
  });
});
