// Preview-only paint adapter. Motion still owns every position and depth value.
function connect() {
  const list = document.querySelector('body[data-ivory-preview] #mori-services-island [data-service-label-list]');
  if (!list) return;
  const buttons = new Map();
  const mirror = wrapper => {
    const button = buttons.get(wrapper);
    const value = wrapper.style.opacity === '' ? 1 : Math.min(1, Math.max(0, Number(wrapper.style.opacity)));
    const opacity = String(value);
    if (button.style.getPropertyValue('--mori-oak-motion-opacity') !== opacity) {
      button.style.setProperty('--mori-oak-motion-opacity', opacity);
    }
  };
  const observer = new MutationObserver(records => {
    for (const { target } of records) mirror(target);
  });
  for (const wrapper of list.children) {
    const button = wrapper.querySelector(':scope > [data-service-button]');
    if (!button) continue;
    buttons.set(wrapper, button);
    mirror(wrapper);
    button.setAttribute('data-oak-contrast', '');
    observer.observe(wrapper, { attributes: true, attributeFilter: ['style'] });
  }
  window.addEventListener('pagehide', event => {
    if (!event.persisted) observer.disconnect();
  });
}

if (document.querySelector('body[data-ivory-preview] #mori-services-island [data-service-label-list]')) connect();
else document.addEventListener('mori:services-ready', connect, { once: true });
