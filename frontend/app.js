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


// Evidence report builder. Reports are generated on demand and are not stored by the server.
const findingForm = document.querySelector('#finding-form');
const draftFindingsElement = document.querySelector('#draft-findings');
const draftCount = document.querySelector('#draft-count');
const reportOutput = document.querySelector('#report-output');
const reportFeedback = document.querySelector('#report-feedback');
const addFindingButton = document.querySelector('#add-finding');
const generateReportButton = document.querySelector('#generate-report');
const downloadReportButton = document.querySelector('#download-report');
const printReportButton = document.querySelector('#print-report');
const draftFindings = [];
let generatedReport = null;

function reportMessage(message, success = false) {
  reportFeedback.hidden = false;
  reportFeedback.className = success ? 'feedback success' : 'feedback';
  reportFeedback.textContent = message;
}

function renderDraftFindings() {
  draftFindingsElement.replaceChildren();
  draftCount.textContent = draftFindings.length + ' / 20';
  if (!draftFindings.length) {
    draftFindingsElement.append(textElement('li', 'empty-record', 'No findings added yet.'));
    return;
  }
  draftFindings.forEach((finding, index) => {
    const item = document.createElement('li');
    item.className = 'draft-item';
    const copy = document.createElement('div');
    copy.append(
      textElement('strong', '', (index + 1) + '. ' + finding.claim),
      textElement('span', 'draft-meta', finding.sourceName + ' · ' + finding.verificationState.replaceAll('_', ' '))
    );
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-finding';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', 'Remove finding ' + (index + 1));
    remove.addEventListener('click', () => {
      draftFindings.splice(index, 1);
      generatedReport = null;
      reportOutput.hidden = true;
      renderDraftFindings();
    });
    item.append(copy, remove);
    draftFindingsElement.append(item);
  });
}

addFindingButton.addEventListener('click', () => {
  if (draftFindings.length >= 20) {
    reportMessage('A report can contain at most 20 findings.');
    return;
  }
  const finding = {
    claim: document.querySelector('#finding-claim').value.trim(),
    sourceName: document.querySelector('#source-name').value.trim(),
    sourceUrl: document.querySelector('#source-url').value.trim(),
    category: document.querySelector('#finding-category').value,
    verificationState: document.querySelector('#verification-state').value,
    notes: document.querySelector('#finding-notes').value.trim()
  };
  if (!finding.claim || !finding.sourceName || !finding.sourceUrl) {
    reportMessage('Enter a claim, source name, and source URL before adding a finding.');
    return;
  }
  draftFindings.push(finding);
  generatedReport = null;
  reportOutput.hidden = true;
  document.querySelector('#finding-claim').value = '';
  document.querySelector('#finding-notes').value = '';
  renderDraftFindings();
  reportMessage('Finding added to the draft. Add another or generate the report.', true);
});

findingForm.addEventListener('submit', async event => {
  event.preventDefault();
  if (!draftFindings.length) {
    reportMessage('Add at least one finding before generating a report.');
    return;
  }
  generateReportButton.disabled = true;
  generateReportButton.textContent = 'Generating…';
  try {
    const response = await fetch('/api/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        subject: {
          type: document.querySelector('#subject-type').value,
          name: document.querySelector('#subject-name').value.trim()
        },
        findings: draftFindings
      })
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || payload.error || 'Report could not be generated.');
    generatedReport = payload;
    renderGeneratedReport(payload);
    reportMessage('Report generated. Export it and store it securely; Tracelynt does not save it.', true);
  } catch (error) {
    reportMessage(error instanceof TypeError
      ? 'Could not reach the Tracelynt API. Open this page through the local backend.'
      : (error.message || 'Report could not be generated.'));
  } finally {
    generateReportButton.disabled = false;
    generateReportButton.textContent = 'Generate report';
  }
});

function renderGeneratedReport(report) {
  document.querySelector('#report-generated-at').textContent = 'Generated ' + new Date(report.generatedAt).toLocaleString();
  document.querySelector('#report-disclaimer').textContent = report.interpretation.statement + ' ' + report.interpretation.guidance;
  const container = document.querySelector('#report-findings');
  container.replaceChildren();
  report.findings.forEach(finding => {
    const article = document.createElement('article');
    article.className = 'report-finding';
    article.append(
      textElement('h4', '', finding.id + '. ' + finding.claim),
      textElement('p', 'draft-meta', finding.category.replaceAll('_', ' ') + ' · ' + finding.verificationState.replaceAll('_', ' '))
    );
    const source = document.createElement('a');
    source.href = finding.source.url;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = finding.source.name + ' — ' + finding.source.url;
    article.append(source);
    if (finding.notes) article.append(textElement('p', 'report-note', finding.notes));
    container.append(article);
  });
  const caveats = document.createElement('ul');
  caveats.className = 'report-limitations';
  report.limitations.forEach(item => caveats.append(textElement('li', '', item)));
  container.append(caveats);
  reportOutput.hidden = false;
  reportOutput.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

downloadReportButton.addEventListener('click', () => {
  if (!generatedReport) return;
  const data = JSON.stringify(generatedReport, null, 2);
  const file = new Blob([data], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'tracelynt-evidence-report.json';
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
});

printReportButton.addEventListener('click', () => {
  if (generatedReport) window.print();
});

renderDraftFindings();
