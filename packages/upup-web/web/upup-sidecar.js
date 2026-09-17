/* eslint-disable */
/**
 * UpUp sidecar — vanilla JS widgets that ride on top of the @agegr/pi-web
 * UI. Injected into every HTML response by the upup-web proxy.
 *
 * Exposes a global UpUpSidecar() factory so the upstream React tree (or
 * any browser extension) can talk to /api/upup/* without coordinating
 * with our bundle.
 */
(function () {
  'use strict';

  async function api(method, path, body) {
    const init = { method, headers: { 'accept': 'application/json' } };
    if (body !== undefined) {
      init.headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const res = await fetch(path, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }

  function el(tag, props, ...children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2).toLowerCase(), v);
        else node.setAttribute(k, v);
      }
    }
    for (const child of children) {
      if (child == null) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
    return node;
  }

  function mount(node) {
    const root = el('div', { id: 'upup-sidecar-root', style: {
      position: 'fixed', right: '12px', bottom: '12px', zIndex: 2147483646,
      display: 'flex', flexDirection: 'column', gap: '8px',
      fontFamily: 'system-ui, sans-serif', fontSize: '12px',
      color: '#111', background: 'rgba(255,255,255,0.92)',
      border: '1px solid #ccc', borderRadius: '8px',
      padding: '10px', maxWidth: '320px', boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
    } });
    document.body.appendChild(root);
    node(root);
    return root;
  }

  async function renderWatchlist(root) {
    try {
      const { watchlist } = await api('GET', '/api/upup/watchlist');
      root.appendChild(el('div', { style: { fontWeight: 600 } }, '📈 Watchlist'));
      if (!watchlist || watchlist.length === 0) {
        root.appendChild(el('div', { style: { color: '#888' } }, '(empty — add a ticker)'));
        return;
      }
      const list = el('ul', { style: { margin: 0, paddingLeft: '16px' } });
      for (const entry of watchlist.slice(0, 8)) {
        list.appendChild(el('li', null, String(entry.symbol ?? entry)));
      }
      root.appendChild(list);
    } catch (err) {
      root.appendChild(el('div', { style: { color: '#c00' } }, `watchlist: ${err.message}`));
    }
  }

  async function renderPlan(root) {
    try {
      const state = await api('GET', '/api/upup/state');
      root.appendChild(el('div', { style: { fontWeight: 600 } }, '🎯 Plan'));
      root.appendChild(el('div', null, `Ticker: ${state.ticker ?? '—'}`));
      root.appendChild(el('div', null, `SOP: ${state.sop ?? '—'}`));
      root.appendChild(el('div', null, `PlanId: ${state.planId ?? '—'}`));
      if (state.note) root.appendChild(el('div', { style: { color: '#555' } }, state.note));
    } catch (err) {
      root.appendChild(el('div', { style: { color: '#c00' } }, `plan: ${err.message}`));
    }
  }

  async function renderCommand(root) {
    const input = el('input', {
      type: 'text', placeholder: 'e.g. --sop graham 600519.SH',
      style: { flex: '1', padding: '4px 6px', border: '1px solid #aaa', borderRadius: '4px' },
    });
    const submit = el('button', {
      style: { padding: '4px 8px', border: '1px solid #888', borderRadius: '4px', background: '#f4f4f4' },
      onclick: async () => {
        submit.disabled = true;
        submit.textContent = '...';
        try {
          const { result } = await api('POST', `/api/upup/run/${encodeURIComponent(input.value)}`);
          root.appendChild(el('pre', {
            style: {
              marginTop: '6px', padding: '6px', background: '#fafafa',
              border: '1px solid #eee', borderRadius: '4px', whiteSpace: 'pre-wrap', maxHeight: '160px', overflow: 'auto',
            },
          }, String(result).slice(0, 2000)));
        } catch (err) {
          root.appendChild(el('div', { style: { color: '#c00' } }, `run: ${err.message}`));
        } finally {
          submit.disabled = false;
          submit.textContent = 'Run';
        }
      },
    }, 'Run');
    const row = el('div', { style: { display: 'flex', gap: '6px' } }, input, submit);
    root.appendChild(el('div', { style: { fontWeight: 600 } }, '⚡ Run /invest'));
    root.appendChild(row);
  }

  function init() {
    mount((root) => {
      renderWatchlist(root);
      renderPlan(root);
      renderCommand(root);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.UpUpSidecar = { api, refresh: init };
})();
