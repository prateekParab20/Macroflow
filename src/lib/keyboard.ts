const TEXT_TYPES = new Set(['hidden', 'button', 'checkbox', 'radio', 'file', 'range', 'submit', 'reset']);

export function isTextField(target: EventTarget | null): target is HTMLInputElement | HTMLTextAreaElement {
  if (target instanceof HTMLTextAreaElement) return !target.disabled && !target.readOnly;
  if (!(target instanceof HTMLInputElement) || target.disabled || target.readOnly) return false;
  return !TEXT_TYPES.has(target.type);
}

export interface FocusRestoreInput {
  pointerDownOutside: boolean;
  relatedTargetIsField: boolean;
  msSinceFocus: number;
  msSinceKeyboardOpened: number;
  restores: number;
}

/** Refocus only when the keyboard itself just opened and blurred the field. */
export function decideFocusRestore(input: FocusRestoreInput): boolean {
  if (input.pointerDownOutside || input.relatedTargetIsField || input.restores >= 2) return false;
  const fresh = input.msSinceFocus >= 0 && input.msSinceFocus < 1500;
  const keyboardJustOpened = input.msSinceKeyboardOpened >= 0 && input.msSinceKeyboardOpened < 1200;
  return fresh && keyboardJustOpened;
}

let focusAt = 0;
let openedAt = 0;
let restores = 0;
let focused: HTMLElement | null = null;
let pointerAt = 0;
let pointerTarget: EventTarget | null = null;
let pending: HTMLElement | null = null;
let pendingAt = 0;
let vvHeight = 0;
let installed = false;

export function fieldFocusedRecently(windowMs = 600): boolean {
  return focusAt > 0 && Date.now() - focusAt < windowMs;
}

function keyboardInsetPx(): number {
  const viewport = window.visualViewport;
  if (!viewport) return 0;
  return Math.max(0, Math.round(window.innerHeight - viewport.height - viewport.offsetTop));
}

function applyInset() {
  const px = keyboardInsetPx();
  document.documentElement.style.setProperty('--keyboard-inset', `${px}px`);
  document.documentElement.classList.toggle('keyboard-open', px > 80);
}

function reveal(field: HTMLElement) {
  field.scrollIntoView({ block: 'center', inline: 'nearest' });
}

function pointerDownOutside(field: HTMLElement | null): boolean {
  if (!pointerTarget || Date.now() - pointerAt > 500) return false;
  if (!field) return true;
  return pointerTarget !== field && !(pointerTarget instanceof Node && field.contains(pointerTarget));
}

function restore(field: HTMLElement) {
  if (!field.isConnected || restores >= 2) return;
  restores += 1;
  pending = field;
  pendingAt = Date.now();
  requestAnimationFrame(() => {
    if (!field.isConnected) return;
    if (document.activeElement !== field) field.focus({ preventScroll: true });
    reveal(field);
  });
}

function maybeRestore(field: HTMLElement) {
  const decision = decideFocusRestore({
    pointerDownOutside: pointerDownOutside(field),
    relatedTargetIsField: false,
    msSinceFocus: Date.now() - focusAt,
    msSinceKeyboardOpened: openedAt ? Date.now() - openedAt : Number.POSITIVE_INFINITY,
    restores,
  });
  if (decision) restore(field);
}

export function installKeyboardAssist() {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return () => {};
  installed = true;
  vvHeight = window.visualViewport?.height ?? window.innerHeight;

  const onPointerDown = (event: PointerEvent) => {
    pointerAt = Date.now();
    pointerTarget = event.target;
  };

  const onFocusIn = (event: FocusEvent) => {
    if (!isTextField(event.target)) return;
    if (event.target !== focused) restores = 0;
    focused = event.target;
    focusAt = Date.now();
    document.documentElement.classList.add('field-focused');
    requestAnimationFrame(() => {
      applyInset();
      if (event.target instanceof HTMLElement && document.activeElement === event.target) reveal(event.target);
    });
  };

  const onBlurCapture = (event: FocusEvent) => {
    if (!isTextField(event.target) || event.target !== focused) return;
    const outside = pointerDownOutside(event.target);
    const related = isTextField(event.relatedTarget);
    if (outside || related) {
      pending = null;
      return;
    }
    pending = event.target;
    pendingAt = Date.now();
    maybeRestore(event.target);
  };

  const onFocusOut = () => {
    window.setTimeout(() => {
      if (!isTextField(document.activeElement)) {
        focused = null;
        document.documentElement.classList.remove('field-focused');
      }
    }, 450);
  };

  const onViewport = () => {
    applyInset();
    const next = window.visualViewport?.height ?? window.innerHeight;
    const shrunk = vvHeight > 0 && next < vvHeight - 60;
    vvHeight = next;
    if (!shrunk) return;
    openedAt = Date.now();
    const active = document.activeElement;
    if (isTextField(active)) {
      reveal(active);
      return;
    }
    if (pending && Date.now() - pendingAt < 800) maybeRestore(pending);
  };

  document.addEventListener('pointerdown', onPointerDown, true);
  document.addEventListener('focusin', onFocusIn);
  document.addEventListener('blur', onBlurCapture, true);
  document.addEventListener('focusout', onFocusOut);
  window.visualViewport?.addEventListener('resize', onViewport);
  window.visualViewport?.addEventListener('scroll', onViewport);
  window.addEventListener('resize', onViewport);
  applyInset();

  return () => {
    installed = false;
    document.removeEventListener('pointerdown', onPointerDown, true);
    document.removeEventListener('focusin', onFocusIn);
    document.removeEventListener('blur', onBlurCapture, true);
    document.removeEventListener('focusout', onFocusOut);
    window.visualViewport?.removeEventListener('resize', onViewport);
    window.visualViewport?.removeEventListener('scroll', onViewport);
    window.removeEventListener('resize', onViewport);
  };
}
