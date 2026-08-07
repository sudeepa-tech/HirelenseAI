/** Anonymous per-browser user id (swap for real auth in production). */
const KEY = "hirelens_uid";
export function getUserId() {
  let id = localStorage.getItem(KEY);
  if (!id) {
    id = "u_" + crypto.randomUUID().replace(/-/g, "").slice(0, 24);
    localStorage.setItem(KEY, id);
  }
  return id;
}
