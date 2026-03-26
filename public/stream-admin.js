async function api(path, options = {}) {
    const response = await fetch(path, {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
        ...options,
    });
    const text = await response.text();
    let data = {};
    try {
        data = text ? JSON.parse(text) : {};
    } catch (error) {
        data = { message: text };
    }
    if (!response.ok) {
        throw new Error(data.message || `HTTP ${response.status}`);
    }
    return data;
}

function showMessage(el, msg, isError = false) {
    el.className = isError ? 'error' : 'success';
    el.textContent = msg;
}

async function copyText(text) {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return;
    }

    const helper = document.createElement('textarea');
    helper.value = text;
    helper.setAttribute('readonly', '');
    helper.style.position = 'fixed';
    helper.style.opacity = '0';
    helper.style.pointerEvents = 'none';
    document.body.appendChild(helper);
    helper.focus();
    helper.select();

    const copied = document.execCommand('copy');
    document.body.removeChild(helper);
    if (!copied) {
        throw new Error('Clipboard API unavailable');
    }
}

let myKey = null;

function setStreamUrl(key) {
    const streamUrlInput = document.getElementById('stream-url');
    if (!key) {
        streamUrlInput.value = '';
        return;
    }
    streamUrlInput.value = `${window.location.origin}/stream/${key}`;
}

async function loadRegions() {
    const regions = await api('/REGIONS', { method: 'GET' });
    const regionSelect = document.getElementById('region');
    regionSelect.innerHTML = '';
    regions.sort().forEach((region) => {
        const option = document.createElement('option');
        option.value = region;
        option.textContent = region;
        regionSelect.appendChild(option);
    });
}

async function loadClasses(selectedClass = null) {
    const region = document.getElementById('region').value;
    const classSelect = document.getElementById('cclass');
    classSelect.innerHTML = '';
    if (!region) {
        return;
    }

    const classes = await api(`/${region}/classes`, { method: 'GET' });
    const unique = [...new Set((classes || []).map((c) => String(c).toUpperCase()))];
    if (!unique.includes('PAX')) unique.unshift('PAX');
    if (!unique.includes('RAW')) unique.unshift('RAW');

    unique.forEach((cclass) => {
        const option = document.createElement('option');
        option.value = cclass;
        option.textContent = cclass;
        classSelect.appendChild(option);
    });

    if (selectedClass && unique.includes(selectedClass)) {
        classSelect.value = selectedClass;
    }
}

async function loadMyKey() {
    const keys = await api('/api/stream/keys', { method: 'GET' });
    const entry = Array.isArray(keys) && keys.length > 0 ? keys[0] : null;
    if (!entry) {
        throw new Error('No stream key found for this user');
    }

    myKey = entry.key;
    setStreamUrl(myKey);
    document.getElementById('driver').value = entry.driver || '';
    document.getElementById('override').value = entry.textOverride || '';

    const region = String(entry.region || '').toUpperCase();
    const cclass = String(entry.cclass || '').toUpperCase();
    const regionSelect = document.getElementById('region');
    if (region) {
        regionSelect.value = region;
    }
    await loadClasses(cclass);
}

async function enterAdmin() {
    document.getElementById('login-card').classList.add('hidden');
    document.getElementById('admin-card').classList.remove('hidden');
    await loadRegions();
    await loadMyKey();
}

async function checkSession() {
    try {
        await api('/api/stream/session', { method: 'GET' });
        await enterAdmin();
    } catch (error) {
        // not logged in
    }
}

async function updateBootstrapState() {
    const status = await api('/api/stream/users/status', { method: 'GET' });
    const bootstrapNote = document.getElementById('bootstrap-note');
    const bootstrapBtn = document.getElementById('bootstrap-btn');
    const atMaxUsers = status.userCount >= status.maxUsers;
    bootstrapBtn.disabled = atMaxUsers;
    if (atMaxUsers) {
        bootstrapNote.classList.remove('hidden');
        bootstrapNote.textContent = `Max users reached (${status.maxUsers}/${status.maxUsers}).`;
    } else {
        bootstrapNote.classList.add('hidden');
        bootstrapNote.textContent = '';
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    const loginMsg = document.getElementById('login-msg');
    const createMsg = document.getElementById('create-msg');

    document.getElementById('region').addEventListener('change', async () => {
        try {
            await loadClasses();
        } catch (error) {
            showMessage(createMsg, error.message, true);
        }
    });

    document.getElementById('login-btn').addEventListener('click', async () => {
        try {
            await api('/api/stream/login', {
                method: 'POST',
                body: JSON.stringify({
                    username: document.getElementById('username').value,
                    password: document.getElementById('password').value,
                }),
            });
            showMessage(loginMsg, 'Login successful');
            await enterAdmin();
        } catch (error) {
            showMessage(loginMsg, error.message, true);
        }
    });

    document.getElementById('bootstrap-btn').addEventListener('click', async () => {
        try {
            await api('/api/stream/users/signup', {
                method: 'POST',
                body: JSON.stringify({
                    username: document.getElementById('username').value,
                    password: document.getElementById('password').value,
                }),
            });
            showMessage(loginMsg, 'User created. You can now login.');
            await updateBootstrapState();
        } catch (error) {
            showMessage(loginMsg, error.message, true);
        }
    });

    document.getElementById('copy-url-btn').addEventListener('click', async () => {
        if (!myKey) {
            showMessage(createMsg, 'No stream key available', true);
            return;
        }
        try {
            const streamUrl = `${window.location.origin}/stream/${myKey}`;
            await copyText(streamUrl);
            showMessage(createMsg, 'Stream URL copied');
        } catch (error) {
            showMessage(createMsg, `Copy failed: ${error.message}`, true);
        }
    });

    document.getElementById('rotate-key-btn').addEventListener('click', async () => {
        try {
            const rotated = await api('/api/stream/keys/rotate', { method: 'POST' });
            myKey = rotated.key;
            setStreamUrl(myKey);
            showMessage(createMsg, `Created new key: ${window.location.origin}${rotated.url}`);
        } catch (error) {
            showMessage(createMsg, error.message, true);
        }
    });

    document.getElementById('create-btn').addEventListener('click', async () => {
        try {
            const updated = await api('/api/stream/keys', {
                method: 'POST',
                body: JSON.stringify({
                    driver: document.getElementById('driver').value,
                    region: document.getElementById('region').value,
                    cclass: document.getElementById('cclass').value,
                    textOverride: document.getElementById('override').value,
                }),
            });
            myKey = updated.key;
            setStreamUrl(myKey);
            showMessage(createMsg, `Saved: ${window.location.origin}${updated.url}`);
        } catch (error) {
            showMessage(createMsg, error.message, true);
        }
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
        await api('/api/stream/logout', { method: 'POST' });
        window.location.reload();
    });

    await updateBootstrapState();
    await checkSession();
});
