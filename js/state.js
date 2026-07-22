/* ---------- Shared mutable app state ----------
   A single shared object so every module can read/write the same
   in-memory state (players/matches, current user, UI toggles, etc.)
   without creating separate disconnected copies. */
export const state = {
  data: { players: [], matches: [] },
  currentUser: null,      // { uid, email, displayName, role, approved }
  isAdmin: false,
  photoUploadTargetId: null,
  showManageUsers: false,
  creatingMyProfile: false,
  editingMatchId: null,
  expandedPlayerId: null,
  profileEditPlayerId: null
};