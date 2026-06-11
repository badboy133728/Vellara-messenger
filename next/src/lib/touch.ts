/** preventDefault only when the browser allows interrupting the gesture. */
export function preventTouchDefault(event: { cancelable?: boolean; preventDefault: () => void }) {
  if (event.cancelable !== false) {
    event.preventDefault();
  }
}
