const form = document.querySelector('#lookup-form');
const input = document.querySelector('#domain');
const button = document.querySelector('#submit-button');
const buttonLabel = document.querySelector('#button-label');
const feedback = document.querySelector('#feedback');
const results = document.querySelector('#results');

function textElement(tag, className, value) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value;
  return element;
}

function showFeedback(message, success = false) {
  feedback.hidden = false;
  feedback.className = success ? 'feedback success' : 'feedback';
  feedback.textContent = message;
}

function renderRecordCard(title, result, format) {
  const card = document.createElement('article');
  card.className = 'record-card';
  card.append(textElement('h3', '', title));
  card.append(textElement('p', 'record-status', result.status || 'unknown'));
  const list = document.createElement('ul');
  list.className = 'record-list';
  const records = Array.isArray(result.records) ? result.records : [];
  const values = records.map(format);
  if (values.length === 0) {
    list.append(textElement('li', 'empty-record', result.status === 'error' ? 'Lookup unavailable' : 'No records returned'));
  } else {
    values.forEach(value => list.append(textElement('li', '', value)));
  }
  card.append(list);
  return card;
}

function renderTls(tls) {
  const target = document.querySelector('#tls-details');
  target.replaceChildren();
  const entries = tls?.status === 'ok'
    ? [
        ['Status', tls.authorized ? 'Certificate authorized' : 'Certificate not authorized'],
        ['Protocol', tls.protocol || 'Not reported'],
        ['Subject', tls.subject || 'Not reported'],
        ['Issuer', tls.issuer || 'Not reported'],
        ['Valid from', tls.validFrom || 'Not reported'],
        ['Valid to', tls.validTo || 'Not reported']
      ]
    : [
        ['Status', tls?.status || 'unknown'],
        ['Detail', tls?.reason || tls?.error || 'TLS check unavailable']
      ];
  for (const [label, value] of entries) {
    const item = document.createElement('div');
    item.className = 'detail';
    item.append(textElement('dt', '', label), textElement('dd', '', value));
    target.append(item);
  }
}

function renderReport(report) {
  document.querySelector('#result-domain').textContent = report.domain;
  document.querySelector('#retrieved-at').textContent = 'Retrieved ' + new Date(report.retrievedAt).toLocaleString();
  const grid = document.querySelector('#record-grid');
  grid.replaceChildren();
  const dns = report.checks?.dns || {};
  grid.append(
    renderRecordCard('IPv4 · A records', dns.ipv4 || {}, value => value),
    renderRecordCard('IPv6 · AAAA records', dns.ipv6 || {}, value => value),
    renderRecordCard('Mail · MX records', dns.mx || {}, value => value.priority + ' · ' + value.exchange),
    renderRecordCard('TXT records', dns.txt || {}, value => value)
  );
  renderTls(report.checks?.tls || {});
  const limitations = document.querySelector('#limitations-list');
  limitations.replaceChildren();
  (Array.isArray(report.limitations) ? report.limitations : []).forEach(item => limitations.append(textElement('li', '', item)));
  results.hidden = false;
  showFeedback('Inspection completed. Review the limitations before interpreting these technical observations.', true);
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  feedback.hidden = true;
  results.hidden = true;
  button.disabled = true;
  buttonLabel.textContent = 'Inspecting…';
  try {
    const response = await fetch('/api/domain-check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ domain: input.value })
    });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.message || payload.error || 'The inspection could not be completed.');
    }
    renderReport(payload);
  } catch (error) {
    showFeedback(error instanceof TypeError
      ? 'Could not reach the Tracelynt API. Start the backend and open the interface from the same local server.'
      : (error.message || 'The inspection could not be completed.'));
  } finally {
    button.disabled = false;
    buttonLabel.textContent = 'Inspect domain';
  }
});
