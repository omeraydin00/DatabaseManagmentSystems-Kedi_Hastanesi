const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// PostgreSQL connection. Host, user and password come from the usual PG* environment
// variables (PGHOST, PGUSER, PGPASSWORD, PGPORT), so nothing secret lives in the code.
const pool = new Pool({
    database: process.env.PGDATABASE || 'kedi_hastanesi',
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

const PATIENT_FIELDS = ['isim', 'tur', 'yas', 'cinsiyet', 'saglikDurumu', 'sahipBilgileri'];

function readPatient(body) {
    const patient = {};
    PATIENT_FIELDS.forEach(field => {
        const value = typeof body[field] === 'string' ? body[field].trim() : body[field];
        patient[field] = value === '' || value === undefined ? null : value;
    });
    return patient;
}

function checkPatient(patient) {
    if (!patient.isim || !patient.cinsiyet || patient.yas === null) {
        return 'İsim, yaş ve cinsiyet zorunludur.';
    }
    const yas = Number(patient.yas);
    if (!Number.isInteger(yas) || yas < 0 || yas > 30) {
        return 'Yaş 0 ile 30 arasında bir tam sayı olmalıdır.';
    }
    return null;
}

// Patients with the day they were last seen
const PATIENT_LIST = `
    SELECT h.*, MAX(r.Tarih) FILTER (WHERE r.Tarih <= CURRENT_DATE) AS sonziyaret
    FROM Hasta h
    LEFT JOIN Randevu r ON r.HastaID = h.HastaID
`;

// Routes

// Homepage
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// The numbers at the top of the page
app.get('/ozet', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                (SELECT COUNT(*) FROM Hasta)::int AS hasta,
                (SELECT COUNT(*) FROM Randevu WHERE Tarih = CURRENT_DATE)::int AS bugun,
                (SELECT COUNT(*) FROM Randevu WHERE Tarih = CURRENT_DATE AND Durum = 'Bekliyor')::int AS bekleyen,
                (SELECT COUNT(*) FROM Stok WHERE Miktar < 10)::int AS kritikstok
        `);
        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error fetching the summary:', error);
        res.status(500).send('Özet alınırken bir hata oluştu.');
    }
});

// List all patients
app.get('/hastalar', async (req, res) => {
    try {
        const result = await pool.query(`${PATIENT_LIST} GROUP BY h.HastaID ORDER BY h.Isim`);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching patients:', error);
        res.status(500).send('Hastalar alınırken bir hata oluştu.');
    }
});

// Search patients by name, breed or owner
app.get('/hastalar/arama', async (req, res) => {
    try {
        const { isim, tur, q } = req.query;
        const conditions = [];
        const params = [];

        if (isim) {
            params.push(`%${isim}%`);
            conditions.push(`h.Isim ILIKE $${params.length}`);
        }

        if (tur) {
            params.push(`%${tur}%`);
            conditions.push(`h.Tur ILIKE $${params.length}`);
        }

        if (q) {
            params.push(`%${q}%`);
            const n = params.length;
            conditions.push(`(h.Isim ILIKE $${n} OR h.Tur ILIKE $${n} OR h.SahipBilgileri ILIKE $${n})`);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const result = await pool.query(`${PATIENT_LIST} ${where} GROUP BY h.HastaID ORDER BY h.Isim`, params);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error searching patients:', error);
        res.status(500).send('Arama yapılırken bir hata oluştu.');
    }
});

// One patient with their appointments, treatments and prescriptions
app.get('/hastalar/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const patient = await pool.query('SELECT * FROM Hasta WHERE HastaID = $1', [id]);
        if (!patient.rows.length) {
            return res.status(404).send('Hasta bulunamadı.');
        }

        const history = await pool.query(`
            SELECT r.RandevuID, r.Tarih, to_char(r.Saat, 'HH24:MI') AS saat, r.Durum, rt.TurAdi,
                   p.Isim AS veteriner, t.Aciklama AS tedavi, tt.TedaviAdi,
                   COALESCE(json_agg(json_build_object('ilac', rc.IlacBilgisi, 'talimat', rc.KullanimTalimati))
                            FILTER (WHERE rc.ReceteID IS NOT NULL), '[]') AS receteler
            FROM Randevu r
            JOIN Personel p ON p.PersonelID = r.VeterinerID
            LEFT JOIN RandevuTuru rt ON rt.RandevuTurID = r.RandevuTurID
            LEFT JOIN Tedavi t ON t.RandevuID = r.RandevuID
            LEFT JOIN TedaviTuru tt ON tt.TedaviTurID = t.TedaviTurID
            LEFT JOIN Recete rc ON rc.TedaviID = t.TedaviID
            WHERE r.HastaID = $1
            GROUP BY r.RandevuID, rt.TurAdi, p.Isim, t.TedaviID, tt.TedaviAdi
            ORDER BY r.Tarih DESC, r.Saat DESC
        `, [id]);

        res.status(200).json({ ...patient.rows[0], gecmis: history.rows });
    } catch (error) {
        console.error('Error fetching the patient:', error);
        res.status(500).send('Hasta alınırken bir hata oluştu.');
    }
});

// Add a new patient
app.post('/hastalar', async (req, res) => {
    try {
        const patient = readPatient(req.body);
        const problem = checkPatient(patient);
        if (problem) {
            return res.status(400).send(problem);
        }

        const result = await pool.query(
            'INSERT INTO Hasta (Isim, Tur, Yas, Cinsiyet, SaglikDurumu, SahipBilgileri) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            PATIENT_FIELDS.map(field => patient[field])
        );

        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error('Error adding patient:', error);
        res.status(500).send('Hasta eklenirken bir hata oluştu.');
    }
});

// Update a patient
app.put('/hastalar/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const patient = readPatient(req.body);
        const problem = checkPatient(patient);
        if (problem) {
            return res.status(400).send(problem);
        }

        const result = await pool.query(
            'UPDATE Hasta SET Isim = $1, Tur = $2, Yas = $3, Cinsiyet = $4, SaglikDurumu = $5, SahipBilgileri = $6 WHERE HastaID = $7 RETURNING *',
            [...PATIENT_FIELDS.map(field => patient[field]), id]
        );
        if (!result.rows.length) {
            return res.status(404).send('Hasta bulunamadı.');
        }

        res.status(200).json(result.rows[0]);
    } catch (error) {
        console.error('Error updating patient:', error);
        res.status(500).send('Hasta güncellenirken bir hata oluştu.');
    }
});

// Delete a patient. One with appointments is kept, so their treatment history is not lost.
app.delete('/hastalar/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await pool.query('DELETE FROM Hasta WHERE HastaID = $1', [id]);
        res.status(200).json({ message: 'Hasta silindi.' });
    } catch (error) {
        if (error.code === '23503') {
            return res.status(409).send('Bu hastanın randevu kaydı var, silinemez.');
        }
        console.error('Error deleting patient:', error);
        res.status(500).send('Hasta silinirken bir hata oluştu.');
    }
});

// Appointments for a day, today by default
app.get('/randevular', async (req, res) => {
    try {
        const tarih = req.query.tarih || null;
        const result = await pool.query(`
            SELECT r.RandevuID, r.Tarih, to_char(r.Saat, 'HH24:MI') AS saat, r.Durum,
                   h.HastaID, h.Isim AS hasta, h.Tur, rt.TurAdi, p.Isim AS veteriner
            FROM Randevu r
            JOIN Hasta h ON h.HastaID = r.HastaID
            JOIN Personel p ON p.PersonelID = r.VeterinerID
            LEFT JOIN RandevuTuru rt ON rt.RandevuTurID = r.RandevuTurID
            WHERE r.Tarih = COALESCE($1::date, CURRENT_DATE)
            ORDER BY r.Saat
        `, [tarih]);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching appointments:', error);
        res.status(500).send('Randevular alınırken bir hata oluştu.');
    }
});

// Stock that is running low (below 10, the level the StokKritikSeviye trigger warns at)
// or expires within 60 days
app.get('/stok/uyarilar', async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT StokID, UrunAdi, Kategori, Miktar, SonKullanmaTarihi,
                   Miktar < 10 AS kritik,
                   SonKullanmaTarihi < CURRENT_DATE + 60 AS sktyakin
            FROM Stok
            WHERE Miktar < 10 OR SonKullanmaTarihi < CURRENT_DATE + 60
            ORDER BY Miktar
        `);
        res.status(200).json(result.rows);
    } catch (error) {
        console.error('Error fetching stock:', error);
        res.status(500).send('Stok alınırken bir hata oluştu.');
    }
});

// Veritabanı bağlantısını test etmek
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('Veritabanına bağlanılamadı:', err.message);
    } else {
        console.log('Veritabanına başarıyla bağlanıldı. Sunucu zamanı:', res.rows[0].now);
    }
});

// Start the server
const port = process.env.PORT || 3000;
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
