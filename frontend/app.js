const form = document.querySelector('#lookup-form');
const input = document.querySelector('#domain');
const button = document.querySelector('#submit-button');
const buttonLabel = document.querySelector('#button-label');
const feedback = document.querySelector('#feedback');
const results = document.querySelector('#results');
const addDomainObservationsButton = document.querySelector('#add-domain-observations');
let latestDomainReport = null;

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
  latestDomainReport = report;
  addDomainObservationsButton.disabled = false;
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


function domainObservationFindings(report) {
  const findings = [];
  const timestamp = report.retrievedAt;
  const dns = report.checks?.dns || {};
  const describeRecords = (label, result, format) => {
    const records = Array.isArray(result?.records) ? result.records : [];
    const rendered = records.map(format);
    const detail = (rendered.length ? rendered.join('; ') : 'no record values returned').slice(0, 600);
    findings.push({
      claim: label + ' lookup returned status "' + (result?.status || 'unknown') + '" at ' + timestamp + ' (' + detail + ').',
      sourceName: 'Tracelynt domain inspection',
      sourceUrl: '',
      category: 'direct_observation',
      verificationState: 'unreviewed',
      notes: 'System-generated technical observation for ' + report.domain + '. This is not an ownership or legitimacy determination. Review the inspection timestamp and limitations in the original results.'
    });
  };
  describeRecords('DNS A (IPv4)', dns.ipv4, value => String(value));
  describeRecords('DNS AAAA (IPv6)', dns.ipv6, value => String(value));
  describeRecords('DNS MX (mail routing)', dns.mx, value => String(value.priority) + ' · ' + String(value.exchange));
  describeRecords('DNS TXT', dns.txt, value => String(value));
  const tls = report.checks?.tls || {};
  const tlsDetail = (tls.status === 'ok'
    ? 'certificate authorized=' + String(Boolean(tls.authorized)) + '; protocol=' + (tls.protocol || 'not reported') + '; subject=' + (tls.subject || 'not reported') + '; issuer=' + (tls.issuer || 'not reported') + '; valid from=' + (tls.validFrom || 'not reported') + '; valid to=' + (tls.validTo || 'not reported')
    : 'TLS status=' + (tls.status || 'unknown') + '; detail=' + (tls.reason || tls.error || 'not reported')).slice(0, 600);
  findings.push({
    claim: 'TLS certificate inspection for ' + report.domain + ' at ' + timestamp + ': ' + tlsDetail + '.',
    sourceName: 'Tracelynt domain inspection',
    sourceUrl: '',
    category: 'direct_observation',
    verificationState: 'unreviewed',
    notes: 'System-generated point-in-time observation. A TLS certificate does not prove business ownership, operator identity, or legitimacy.'
  });
  return findings;
}

addDomainObservationsButton.addEventListener('click', () => {
  if (!latestDomainReport) {
    reportMessage('Inspect a domain first, then add its observations.');
    return;
  }
  const subjectName = document.querySelector('#subject-name');
  const subjectType = document.querySelector('#subject-type');
  subjectType.value = 'domain';
  subjectName.value = latestDomainReport.domain;
  const candidates = domainObservationFindings(latestDomainReport);
  const available = 20 - draftFindings.length;
  if (available <= 0) {
    reportMessage('The report already has 20 findings. Remove a finding before adding domain observations.');
    return;
  }
  const toAdd = candidates.slice(0, available);
  draftFindings.push(...toAdd);
  generatedReport = null;
  reportOutput.hidden = true;
  renderDraftFindings();
  addDomainObservationsButton.disabled = true;
  reportMessage('Added ' + toAdd.length + ' technical observations from the latest inspection. They are marked unreviewed and do not establish identity or legitimacy.', true);
  document.querySelector('#evidence-report').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

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
  document.querySelector('#source-name').value = '';
  document.querySelector('#source-url').value = '';
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
    if (finding.source.url) {
      const source = document.createElement('a');
      source.href = finding.source.url;
      source.target = '_blank';
      source.rel = 'noopener noreferrer';
      source.textContent = finding.source.name + ' — ' + finding.source.url;
      article.append(source);
    } else {
      article.append(textElement('p', 'draft-meta', finding.source.name + ' · system-generated observation; no external source URL'));
    }
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

/* Private workspace UI. Session and CSRF values stay in memory; no auth data is stored in browser storage. */
const workspaceMessage = document.querySelector('#workspace-message');
const workspaceAnonymous = document.querySelector('#workspace-anonymous');
const workspaceAuthenticated = document.querySelector('#workspace-authenticated');
const workspaceLoginButtons = [document.querySelector('#workspace-login'), document.querySelector('#workspace-sign-in')];
const caseListElement = document.querySelector('#case-list');
const caseDetail = document.querySelector('#case-detail');
const caseEvidenceList = document.querySelector('#case-evidence-list');
const caseReportOutput = document.querySelector('#case-report-output');
let workspaceCsrfToken = null;
let selectedCase = null;
let workspaceCases = [];

function setWorkspaceMessage(message, success = false) {
  workspaceMessage.hidden = false;
  workspaceMessage.className = success ? 'feedback success' : 'feedback';
  workspaceMessage.textContent = message;
}

function setWorkspaceSignedIn(signedIn) {
  workspaceAnonymous.hidden = signedIn;
  workspaceAuthenticated.hidden = !signedIn;
  document.querySelector('#workspace-login').hidden = signedIn;
}

async function workspaceRequest(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  if (options.method && !['GET', 'HEAD'].includes(options.method)) {
    if (!workspaceCsrfToken) throw new Error('Your session has expired. Sign in again.');
    headers['x-csrf-token'] = workspaceCsrfToken;
  }
  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'same-origin',
    cache: 'no-store'
  });
  let payload = {};
  try { payload = await response.json(); } catch {}
  if (!response.ok) {
    if (response.status === 401) throw new Error('Your session is no longer active. Sign in again.');
    if (response.status === 503) throw new Error('Private workspace is unavailable. Check database and OIDC configuration.');
    throw new Error(payload.message || payload.error || 'Request could not be completed.');
  }
  return payload;
}

async function refreshWorkspace() {
  try {
    const session = await workspaceRequest('/api/session');
    if (!session.authenticated) {
      workspaceCsrfToken = null;
      setWorkspaceSignedIn(false);
      setWorkspaceMessage('Private workspace is locked until you sign in. The operator must configure PostgreSQL and an OIDC provider.');
      return;
    }
    workspaceCsrfToken = session.csrfToken;
    setWorkspaceSignedIn(true);
    setWorkspaceMessage('Signed in. Case records are private to this account.', true);
    await loadCases();
  } catch (error) {
    workspaceCsrfToken = null;
    setWorkspaceSignedIn(false);
    setWorkspaceMessage(error.message || 'Private workspace is not available.');
  }
}

async function loadCases() {
  const payload = await workspaceRequest('/api/cases');
  workspaceCases = Array.isArray(payload.cases) ? payload.cases : [];
  caseListElement.replaceChildren();
  if (!workspaceCases.length) {
    caseListElement.append(textElement('li', 'empty-record', 'No cases yet. Create one to start documenting evidence.'));
    selectedCase = null;
    caseDetail.hidden = true;
    return;
  }
  workspaceCases.forEach(item => {
    const li = document.createElement('li');
    li.className = 'case-list-item';
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'case-select';
    select.append(
      textElement('strong', '', item.title),
      textElement('span', 'draft-meta', item.subjectType.replaceAll('_', ' ') + ' · ' + item.subjectLabel),
      textElement('span', 'case-state', item.status)
    );
    select.addEventListener('click', () => openCase(item.id));
    li.append(select);
    caseListElement.append(li);
  });
  if (selectedCase && workspaceCases.some(item => item.id === selectedCase.id)) {
    await openCase(selectedCase.id);
  } else {
    await openCase(workspaceCases[0].id);
  }
}

async function openCase(caseId) {
  const payload = await workspaceRequest('/api/cases/' + encodeURIComponent(caseId));
  selectedCase = payload.case;
  caseDetail.hidden = false;
  caseReportOutput.hidden = true;
  document.querySelector('#selected-case-title').textContent = selectedCase.title;
  document.querySelector('#selected-case-meta').textContent =
    selectedCase.subjectType.replaceAll('_', ' ') + ' · ' + selectedCase.subjectLabel + ' · ' + selectedCase.status;
  document.querySelector('#archive-case').textContent = selectedCase.status === 'archived' ? 'Reopen case' : 'Archive';
  document.querySelector('#evidence-form').hidden = selectedCase.status !== 'open';
  document.querySelector('#generate-case-report').disabled = selectedCase.status !== 'open';
  const payloadEvidence = await workspaceRequest('/api/cases/' + encodeURIComponent(caseId) + '/evidence');
  renderCaseEvidence(payloadEvidence.evidence || []);
}

function renderCaseEvidence(items) {
  caseEvidenceList.replaceChildren();
  document.querySelector('#case-evidence-count').textContent = items.length + ' items';
  if (!items.length) {
    caseEvidenceList.append(textElement('li', 'empty-record', 'No evidence recorded yet.'));
    return;
  }
  items.forEach(item => {
    const li = document.createElement('li');
    li.className = 'case-evidence-item';
    li.append(
      textElement('strong', '', item.claim),
      textElement('span', 'draft-meta', item.category.replaceAll('_', ' ') + ' · ' + item.reviewState.replaceAll('_', ' ') + ' · ' + item.sourceName)
    );
    if (item.sourceUrl) {
      const link = document.createElement('a');
      link.href = item.sourceUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = item.sourceUrl;
      li.append(link);
    }
    if (item.limitations) li.append(textElement('p', 'draft-meta', 'Limitations: ' + item.limitations));
    if (item.correctionNote) li.append(textElement('p', 'draft-meta', 'Correction: ' + item.correctionNote));
    const controls = document.createElement('div');
    controls.className = 'evidence-controls';
    const state = document.createElement('select');
    state.setAttribute('aria-label', 'Review state for evidence');
    for (const value of ['unreviewed', 'corroborated', 'disputed', 'unavailable', 'retracted']) {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value.replaceAll('_', ' ');
      option.selected = value === item.reviewState;
      state.append(option);
    }
    const correction = document.createElement('input');
    correction.maxLength = 2000;
    correction.placeholder = 'Correction note (optional)';
    correction.value = item.correctionNote || '';
    correction.setAttribute('aria-label', 'Correction note');
    const save = document.createElement('button');
    save.type = 'button';
    save.className = 'secondary-button';
    save.textContent = 'Update review';
    save.disabled = selectedCase?.status !== 'open';
    save.addEventListener('click', async () => {
      try {
        await workspaceRequest('/api/cases/' + encodeURIComponent(selectedCase.id) + '/evidence/' + encodeURIComponent(item.id), {
          method: 'PATCH',
          body: JSON.stringify({ reviewState: state.value, correctionNote: correction.value })
        });
        setWorkspaceMessage('Evidence review updated. Existing report versions remain unchanged.', true);
        await openCase(selectedCase.id);
      } catch (error) {
        setWorkspaceMessage(error.message);
      }
    });
    controls.append(state, correction, save);
    li.append(controls);
    caseEvidenceList.append(li);
  });
}

workspaceLoginButtons.forEach(buttonElement => buttonElement.addEventListener('click', () => {
  window.location.assign('/auth/login');
}));

document.querySelector('#workspace-sign-out').addEventListener('click', async () => {
  try {
    await workspaceRequest('/auth/logout', { method: 'POST', body: '{}' });
    workspaceCsrfToken = null;
    selectedCase = null;
    setWorkspaceSignedIn(false);
    setWorkspaceMessage('You have signed out.', true);
  } catch (error) {
    setWorkspaceMessage(error.message);
  }
});

document.querySelector('#case-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const payload = await workspaceRequest('/api/cases', {
      method: 'POST',
      body: JSON.stringify({
        title: document.querySelector('#case-title').value,
        purpose: document.querySelector('#case-purpose').value,
        subjectType: document.querySelector('#case-subject-type').value,
        subjectLabel: document.querySelector('#case-subject-label').value
      })
    });
    document.querySelector('#case-title').value = '';
    document.querySelector('#case-purpose').value = '';
    document.querySelector('#case-subject-label').value = '';
    selectedCase = payload.case;
    setWorkspaceMessage('Private case created.', true);
    await loadCases();
    await openCase(payload.case.id);
  } catch (error) {
    setWorkspaceMessage(error.message);
  }
});

document.querySelector('#evidence-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (!selectedCase) return;
  try {
    await workspaceRequest('/api/cases/' + encodeURIComponent(selectedCase.id) + '/evidence', {
      method: 'POST',
      body: JSON.stringify({
        claim: document.querySelector('#case-evidence-claim').value,
        category: document.querySelector('#case-evidence-category').value,
        sourceName: document.querySelector('#case-evidence-source').value,
        sourceUrl: document.querySelector('#case-evidence-url').value,
        limitations: document.querySelector('#case-evidence-limitations').value
      })
    });
    document.querySelector('#case-evidence-claim').value = '';
    document.querySelector('#case-evidence-source').value = '';
    document.querySelector('#case-evidence-url').value = '';
    document.querySelector('#case-evidence-limitations').value = '';
    setWorkspaceMessage('Evidence saved with its source and limitations.', true);
    await openCase(selectedCase.id);
  } catch (error) {
    setWorkspaceMessage(error.message);
  }
});

document.querySelector('#archive-case').addEventListener('click', async () => {
  if (!selectedCase) return;
  const nextStatus = selectedCase.status === 'archived' ? 'open' : 'archived';
  try {
    await workspaceRequest('/api/cases/' + encodeURIComponent(selectedCase.id), {
      method: 'PATCH',
      body: JSON.stringify({ status: nextStatus })
    });
    setWorkspaceMessage(nextStatus === 'archived' ? 'Case archived.' : 'Case reopened.', true);
    await loadCases();
  } catch (error) {
    setWorkspaceMessage(error.message);
  }
});

document.querySelector('#delete-case').addEventListener('click', async () => {
  if (!selectedCase) return;
  if (!window.confirm('Request deletion of this case? It will be hidden from normal access, but physical deletion and backup expiry are not automated yet.')) return;
  try {
    await workspaceRequest('/api/cases/' + encodeURIComponent(selectedCase.id), {
      method: 'DELETE',
      body: JSON.stringify({ confirm: true })
    });
    selectedCase = null;
    caseDetail.hidden = true;
    setWorkspaceMessage('Deletion requested. This marks the case pending; it does not physically purge data or backups.', true);
    await loadCases();
  } catch (error) {
    setWorkspaceMessage(error.message);
  }
});

document.querySelector('#generate-case-report').addEventListener('click', async () => {
  if (!selectedCase) return;
  try {
    const payload = await workspaceRequest('/api/cases/' + encodeURIComponent(selectedCase.id) + '/reports', {
      method: 'POST',
      body: '{}'
    });
    caseReportOutput.textContent = JSON.stringify(payload.report, null, 2);
    caseReportOutput.hidden = false;
    setWorkspaceMessage('Versioned report ' + payload.report.versionNumber + ' saved. Claims are not independently verified.', true);
  } catch (error) {
    setWorkspaceMessage(error.message);
  }
});

refreshWorkspace();
