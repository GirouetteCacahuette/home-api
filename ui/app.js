// The "Add a tricount" section. It only calls the JSON Operations; the
// server re-checks everything shown here, this page just explains it early.

const $ = (id) => document.getElementById(id);

const previewForm = $('preview-form');
const addForm = $('add-form');
const accountNameInput = $('account-name');
const dialog = $('confirm-dialog');
const confirmButton = $('confirm-button');
const cancelButton = $('cancel-button');

const STEP_LABELS = {
  check: 'Check the tricount is new',
  createAccount: 'Create the Actual account',
  saveConfig: 'Save it to the tricount list',
  firstSync: 'First sync',
};

let preview;
let previewedAt;
let countdown;
let lastAdded = false;

async function callOperation(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'content-type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let payload;
  try {
    payload = await res.json();
  } catch {
    payload = { error: 'bad_response', message: `home-api answered ${res.status}` };
  }
  return { res, payload };
}

function setStatus(element, text, isError = false) {
  element.textContent = text;
  element.classList.toggle('error', isError);
}

function minutesSeconds(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

// Step 1: preview the link.

function startCountdown(seconds) {
  const button = $('preview-button');
  const status = $('preview-status');
  const until = Date.now() + seconds * 1000;
  clearInterval(countdown);
  button.disabled = true;
  const tick = () => {
    const left = Math.ceil((until - Date.now()) / 1000);
    if (left <= 0) {
      clearInterval(countdown);
      button.disabled = false;
      setStatus(status, 'Tricount is available again: preview now.');
      return;
    }
    setStatus(status, `Tricount is rate-limited: try again in ${minutesSeconds(left)}`, true);
  };
  tick();
  countdown = setInterval(tick, 1000);
}

previewForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const link = $('link').value.trim();
  const button = $('preview-button');
  const status = $('preview-status');
  if (!link) {
    setStatus(status, 'Paste a tricount share link first.', true);
    return;
  }
  button.disabled = true;
  addForm.hidden = true;
  setStatus(status, 'Asking Tricount…');
  try {
    const { res, payload } = await callOperation(
      'GET',
      `../budget/shared-expenses/preview?link=${encodeURIComponent(link)}`,
    );
    if (res.status === 429) {
      startCountdown(Number(res.headers.get('retry-after')) || 30);
      return;
    }
    if (!res.ok) {
      setStatus(status, payload.message, true);
      button.disabled = false;
      return;
    }
    preview = payload;
    previewedAt = Date.now();
    setStatus(status, '');
    button.disabled = false;
    showAddForm();
  } catch (err) {
    setStatus(status, `Could not reach home-api: ${err.message}`, true);
    button.disabled = false;
  }
});

// Steps 2 to 4: pick your name, name the account, check the currency.

function showAddForm() {
  $('tricount-title').textContent = preview.title;
  $('tricount-key').textContent = preview.key;
  $('tricount-currency').textContent = preview.currency;

  const blocked = $('currency-blocked');
  blocked.hidden = preview.currencySupported;
  blocked.textContent = preview.currencySupported
    ? ''
    : `This tricount is in ${preview.currency}, but home-api only syncs tricounts in ` +
      `${preview.homeCurrency} (its HOME_CURRENCY): amounts would land in Actual unconverted. ` +
      'It cannot be added.';
  $('member-fieldset').disabled = !preview.currencySupported;
  accountNameInput.disabled = !preview.currencySupported;

  const members = $('members');
  members.replaceChildren(
    ...preview.members.map((member) => {
      const label = document.createElement('label');
      label.className = member.selectable ? 'member' : 'member disabled';
      const radio = document.createElement('input');
      radio.type = 'radio';
      radio.name = 'member';
      radio.value = member.name;
      radio.disabled = !member.selectable;
      const text = document.createElement('span');
      text.textContent = member.active ? member.name : `${member.name} (inactive)`;
      if (member.reason) {
        const reason = document.createElement('small');
        reason.textContent = member.reason;
        text.append(reason);
      }
      label.append(radio, text);
      return label;
    }),
  );

  accountNameInput.value = preview.suggestedAccountName;
  addForm.hidden = false;
  $('result').hidden = true;
  updateAddButton();
}

function selectedMember() {
  return addForm.querySelector('input[name="member"]:checked')?.value;
}

// Actual trims account names, so " Groceries" collides with "Groceries".
function accountNameProblem() {
  const name = accountNameInput.value.trim();
  if (!name) return 'Give the account a name.';
  if (preview.existingAccountNames.some((existing) => existing.trim() === name)) {
    return `Actual already has an account named "${name}".`;
  }
  return '';
}

function updateAddButton() {
  const problem = accountNameProblem();
  setStatus($('account-name-status'), problem, Boolean(problem));
  $('add-button').disabled = !preview.currencySupported || !selectedMember() || Boolean(problem);
}

addForm.addEventListener('change', updateAddButton);
accountNameInput.addEventListener('input', updateAddButton);

// Confirm: recap, then add.

addForm.addEventListener('submit', (event) => {
  event.preventDefault();
  updateAddButton();
  if ($('add-button').disabled) return;
  $('recap-title').textContent = preview.title;
  $('recap-key').textContent = preview.key;
  $('recap-member').textContent = selectedMember();
  $('recap-account').textContent = accountNameInput.value.trim();
  $('recap-currency').textContent = preview.currency;
  setStatus($('confirm-status'), '');
  confirmButton.disabled = false;
  cancelButton.disabled = false;
  dialog.showModal();
});

// Escape would close the dialog behind a running add.
dialog.addEventListener('cancel', (event) => {
  if (confirmButton.disabled) event.preventDefault();
});

// Either button disables both: no second add, no cancelling a running one.
cancelButton.addEventListener('click', () => {
  confirmButton.disabled = true;
  cancelButton.disabled = true;
  dialog.close();
});

confirmButton.addEventListener('click', async () => {
  confirmButton.disabled = true;
  cancelButton.disabled = true;
  // The preview took the Tricount slot; the first sync waits for the next one.
  const waitSeconds = Math.max(
    0,
    preview.retryAfterSeconds - Math.floor((Date.now() - previewedAt) / 1000),
  );
  setStatus(
    $('confirm-status'),
    waitSeconds > 0
      ? `Syncing… (waiting up to ${waitSeconds}s for the Tricount rate limit)`
      : 'Syncing…',
  );
  let outcome;
  try {
    outcome = await callOperation('POST', '../budget/shared-expenses', {
      key: preview.key,
      myMemberName: selectedMember(),
      accountName: accountNameInput.value.trim(),
    });
  } catch (err) {
    outcome = { payload: { message: `Could not reach home-api: ${err.message}` } };
  }
  dialog.close();
  showResult(outcome.payload);
});

// Result: every step's outcome.

function stepText(name, step) {
  const label = STEP_LABELS[name];
  if (step.status === 'skipped') return `${label}: skipped`;
  if (step.status === 'failed') return `${label}: failed — ${step.error}`;
  if (name === 'createAccount') return `${label}: "${step.accountName}" created`;
  if (name === 'firstSync') {
    const { added, updated, failed } = step.summary;
    return `${label}: ${added} added, ${updated} updated, ${failed} failed`;
  }
  return `${label}: done`;
}

function showResult(payload) {
  lastAdded = Boolean(payload.added);
  $('restart-button').textContent = lastAdded ? 'Add another tricount' : 'Back';
  addForm.hidden = true;
  $('result').hidden = false;
  const steps = payload.steps;
  const title = $('result-title');
  if (payload.added) {
    title.textContent =
      steps.firstSync.status === 'done'
        ? `"${preview.title}" added`
        : `"${preview.title}" added, but its first sync failed: the next sync retries it`;
  } else {
    title.textContent = `"${preview.title}" was not added`;
  }
  setStatus($('result-message'), payload.added ? '' : payload.message, !payload.added);
  if (payload.error === 'preview_required') {
    $('result-message').textContent += ' — press Preview again.';
  }

  $('result-steps').replaceChildren(
    ...(steps
      ? Object.entries(STEP_LABELS).map(([name]) => {
          const item = document.createElement('li');
          item.className = steps[name].status;
          item.textContent = stepText(name, steps[name]);
          return item;
        })
      : []),
  );

  const orphan = $('result-orphan');
  const orphaned = steps?.saveConfig.orphanedAccount;
  orphan.hidden = !orphaned;
  orphan.textContent = orphaned
    ? `Account "${orphaned.name}" (${orphaned.id}) was created in Actual but nothing syncs ` +
      'into it: delete it in Actual before adding this tricount again.'
    : '';
}

// After a refusal the link stays, ready to preview again.
$('restart-button').addEventListener('click', () => {
  $('result').hidden = true;
  if (lastAdded) $('link').value = '';
  $('link').focus();
});
