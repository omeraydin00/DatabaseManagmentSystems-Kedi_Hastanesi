const dateFormat = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short' });

let patients = [];
let editingId = null;

// Escape text before it goes into innerHTML
function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function toast(message) {
    const el = document.getElementById('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

async function request(url, options) {
    const response = await fetch(url, options);
    if (!response.ok) {
        throw new Error((await response.text()) || 'Bir hata oluştu.');
    }
    return response.json();
}

function healthPill(text) {
    if (!text) return '';
    const t = text.toLocaleLowerCase('tr');
    const kind = t.includes('sağlıklı') ? 'ok' : t.includes('takip') || t.includes('kontrol') ? 'wait' : '';
    return `<span class="pill ${kind}">${esc(text)}</span>`;
}

function statusPill(status) {
    const kind = status === 'Tamamlandı' ? 'ok' : status === 'Bekliyor' ? 'wait' : '';
    return `<span class="pill ${kind}">${esc(status || 'Planlandı')}</span>`;
}

// Fetch and display the numbers at the top
async function fetchSummary() {
    const s = await request('/ozet');
    document.getElementById('statHasta').textContent = s.hasta;
    document.getElementById('statBugun').textContent = s.bugun;
    document.getElementById('statBekleyen').textContent = s.bekleyen;
    document.getElementById('statStok').textContent = s.kritikstok;
}

function renderPatients(list) {
    const tableBody = document.querySelector('#hastaTable tbody');
    tableBody.innerHTML = list.map(patient => `
        <tr data-id="${patient.hastaid}">
            <td class="name"><strong>${esc(patient.isim)}</strong><span>${esc(patient.tur)}</span></td>
            <td>${esc(patient.yas)}</td>
            <td>${esc(patient.cinsiyet)}</td>
            <td>${healthPill(patient.saglikdurumu)}</td>
            <td>${esc(patient.sahipbilgileri)}</td>
            <td>${patient.sonziyaret ? shortDate.format(new Date(patient.sonziyaret)) : '-'}</td>
            <td class="row-actions">
                <button type="button" class="link" data-edit="${patient.hastaid}">Düzenle</button>
                <button type="button" class="link danger" data-delete="${patient.hastaid}">Sil</button>
            </td>
        </tr>
    `).join('');
    document.getElementById('bosListe').hidden = list.length > 0;
}

// Fetch and display all patients
async function fetchPatients() {
    patients = await request('/hastalar');
    renderPatients(patients);
}

// Search for patients as the user types
async function searchPatients(text) {
    if (!text) return renderPatients(patients);
    renderPatients(await request(`/hastalar/arama?q=${encodeURIComponent(text)}`));
}

async function fetchAppointments() {
    const list = await request('/randevular');
    document.getElementById('randevular').innerHTML = list.length
        ? list.map(r => `
            <li>
                <time>${esc(r.saat)}</time>
                <div><strong>${esc(r.hasta)}</strong><span>${esc(r.turadi)}, ${esc(r.veteriner)}</span></div>
                ${statusPill(r.durum)}
            </li>`).join('')
        : '<li class="empty">Bugün randevu yok.</li>';
}

async function fetchStock() {
    const list = await request('/stok/uyarilar');
    document.getElementById('stok').innerHTML = list.length
        ? list.map(s => `
            <li>
                <div><strong>${esc(s.urunadi)}</strong><br><span>${s.kritik ? `${s.miktar} adet kaldı` : `Son kullanma ${shortDate.format(new Date(s.sonkullanmatarihi))}`}</span></div>
                <span class="pill ${s.kritik ? 'bad' : 'wait'}">${s.kritik ? 'Kritik' : 'SKT yakın'}</span>
            </li>`).join('')
        : '<li class="empty">Uyarı yok.</li>';
}

// Add and edit share one form
function openForm(patient) {
    const form = document.getElementById('hastaForm');
    form.reset();
    document.getElementById('formHata').hidden = true;
    editingId = patient ? patient.hastaid : null;
    document.getElementById('formBaslik').textContent = patient ? `${patient.isim} bilgileri` : 'Yeni hasta';
    if (patient) {
        form.isim.value = patient.isim || '';
        form.tur.value = patient.tur || '';
        form.yas.value = patient.yas ?? '';
        form.cinsiyet.value = patient.cinsiyet || 'Dişi';
        form.saglikDurumu.value = patient.saglikdurumu || '';
        form.sahipBilgileri.value = patient.sahipbilgileri || '';
    }
    document.getElementById('hastaDialog').showModal();
    form.isim.focus();
}

async function savePatient(event) {
    event.preventDefault();
    const form = event.target;
    const body = Object.fromEntries(new FormData(form));
    try {
        await request(editingId ? `/hastalar/${editingId}` : '/hastalar', {
            method: editingId ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        document.getElementById('hastaDialog').close();
        toast(editingId ? 'Hasta güncellendi.' : 'Hasta kaydedildi.');
        await Promise.all([fetchPatients(), fetchSummary()]);
    } catch (error) {
        const el = document.getElementById('formHata');
        el.textContent = error.message;
        el.hidden = false;
    }
}

async function deletePatient(id) {
    const patient = patients.find(p => p.hastaid === id);
    if (!confirm(`${patient ? patient.isim : 'Bu hasta'} silinsin mi?`)) return;
    try {
        await request(`/hastalar/${id}`, { method: 'DELETE' });
        toast('Hasta silindi.');
        await Promise.all([fetchPatients(), fetchSummary()]);
    } catch (error) {
        toast(error.message);
    }
}

// A patient's appointments, treatments and prescriptions, newest first
async function showHistory(id) {
    const p = await request(`/hastalar/${id}`);
    document.getElementById('detayIsim').textContent = p.isim;
    document.getElementById('detayAlt').textContent = [p.tur, `${p.yas} yaş`, p.cinsiyet, p.sahipbilgileri].filter(Boolean).join(', ');
    document.getElementById('gecmis').innerHTML = p.gecmis.length
        ? p.gecmis.map(r => `
            <li>
                <div class="when">${dateFormat.format(new Date(r.tarih))}, ${esc(r.saat)} ${statusPill(r.durum)}</div>
                <div class="what">${esc(r.turadi)}${r.tedaviadi ? `: ${esc(r.tedaviadi)}` : ''}</div>
                <div class="when">${esc(r.veteriner)}</div>
                ${r.tedavi ? `<p>${esc(r.tedavi)}</p>` : ''}
                ${r.receteler.map(rx => `<div class="rx"><strong>${esc(rx.ilac)}</strong><br>${esc(rx.talimat)}</div>`).join('')}
            </li>`).join('')
        : '<li>Henüz randevusu yok.</li>';
    document.getElementById('detayDialog').showModal();
}

document.querySelector('#hastaTable tbody').addEventListener('click', event => {
    const edit = event.target.closest('[data-edit]');
    const del = event.target.closest('[data-delete]');
    if (edit) return openForm(patients.find(p => p.hastaid === Number(edit.dataset.edit)));
    if (del) return deletePatient(Number(del.dataset.delete));
    const row = event.target.closest('tr[data-id]');
    if (row) showHistory(Number(row.dataset.id));
});

let searchTimer;
document.getElementById('arama').addEventListener('input', event => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => searchPatients(event.target.value.trim()), 200);
});

document.getElementById('yeniHasta').addEventListener('click', () => openForm(null));
document.getElementById('hastaForm').addEventListener('submit', savePatient);
document.querySelectorAll('[data-close]').forEach(button =>
    button.addEventListener('click', () => button.closest('dialog').close()));

document.getElementById('bugun').textContent = dateFormat.format(new Date());

// Load everything on page load
Promise.all([fetchSummary(), fetchPatients(), fetchAppointments(), fetchStock()])
    .catch(error => toast(error.message));
