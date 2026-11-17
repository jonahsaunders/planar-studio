export function mountModal(scrim, dialog, { initial = dialog, onClose } = {}) {
  const previous = document.activeElement;
  const background = [...document.body.children].filter(node => !node.inert);
  document.body.append(scrim);
  initial.focus();
  background.forEach(node => { node.inert = true; });

  function close() {
    if (!scrim.isConnected || scrim.inert) return;
    document.removeEventListener('keydown', onKey);
    onClose?.();
    scrim.remove();
    background.forEach(node => { node.inert = false; });
    if (previous?.isConnected) previous.focus();
  }

  function onKey(event) {
    if (scrim.inert) return;
    if (event.key === 'Escape' && !event.defaultPrevented) {
      event.preventDefault();
      close();
    }
    if (event.key !== 'Tab' || event.defaultPrevented) return;
    const controls = [...dialog.querySelectorAll('button,input,select,textarea,a[href],summary,[tabindex]')]
      .filter(node => node.tabIndex >= 0 && !node.matches(':disabled') && !node.closest('[hidden]') && node.getClientRects().length);
    const first = controls[0], last = controls.at(-1);
    const active = document.activeElement;
    const boundary = event.shiftKey ? first : last;
    if (!controls.includes(active) || active === boundary) {
      event.preventDefault();
      (event.shiftKey ? last || initial : first || initial).focus();
    }
  }

  document.addEventListener('keydown', onKey);
  return close;
}
