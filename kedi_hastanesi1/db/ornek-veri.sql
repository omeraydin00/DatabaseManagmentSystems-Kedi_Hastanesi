-- Örnek veri: bir klinik, iki veteriner, bir destek personeli, sekiz kedi ve son iki haftanın
-- randevuları. Tarihler CURRENT_DATE'e göre yazıldı, böylece "bugün" her zaman dolu görünür.
-- Kişiler ve hastalar uydurmadır.

INSERT INTO Klinik (KlinikAdi, Adres) VALUES
('Merkez Klinik', 'Serdivan, Sakarya');

INSERT INTO Personel (Isim, Telefon, Adres, Pozisyon) VALUES
('Dr. Elif Yılmaz', '0264 000 00 01', 'Serdivan, Sakarya', 'Veteriner'),
('Dr. Mert Demir', '0264 000 00 02', 'Adapazarı, Sakarya', 'Veteriner'),
('Zeynep Kaya', '0264 000 00 03', 'Serdivan, Sakarya', 'Destek Personeli');

INSERT INTO Veteriner (VeterinerID, UzmanlikAlani, CalismaSaatleri) VALUES
(1, 'İç hastalıkları', 'Hafta içi 09:00-17:00'),
(2, 'Cerrahi', 'Salı-Cumartesi 10:00-18:00');

INSERT INTO DestekPersoneli (DestekPersonelID, GorevTanimi) VALUES
(3, 'Hasta kabul, randevu ve stok takibi');

INSERT INTO RandevuTuru (TurAdi) VALUES
('Kontrol'), ('Aşı'), ('Ameliyat'), ('Diş bakımı');

INSERT INTO TedaviTuru (TedaviAdi) VALUES
('Muayene'), ('Aşılama'), ('Cerrahi'), ('Diş temizliği');

INSERT INTO Hasta (Isim, Tur, Yas, Cinsiyet, SaglikDurumu, SahipBilgileri) VALUES
('Pamuk', 'Van Kedisi', 3, 'Dişi', 'Sağlıklı', 'Ayşe K.'),
('Duman', 'British Shorthair', 5, 'Erkek', 'Aşı takibinde', 'Can T.'),
('Tarçın', 'Sarman', 2, 'Erkek', 'Diş taşı', 'Selin A.'),
('Minnoş', 'Ankara Kedisi', 9, 'Dişi', 'Böbrek diyeti', 'Hakan Y.'),
('Boncuk', 'Scottish Fold', 1, 'Dişi', 'Sağlıklı', 'Ece D.'),
('Zeytin', 'Tekir', 4, 'Erkek', 'Kısırlaştırma', 'Murat B.'),
('Fıstık', 'Siyam', 7, 'Dişi', 'Kontrolde', 'Deniz Ö.'),
('Karamel', 'Tekir', 6, 'Erkek', 'Sağlıklı', 'Gizem S.');

-- Her randevu RandevuSonrasiTedaviTrigger ile kendi tedavi kaydını açar
INSERT INTO Randevu (HastaID, VeterinerID, Tarih, Saat, Durum, RandevuTurID) VALUES
(1, 1, CURRENT_DATE - 12, '10:00', 'Tamamlandı', 2),
(4, 1, CURRENT_DATE - 9, '11:30', 'Tamamlandı', 1),
(7, 1, CURRENT_DATE - 6, '15:00', 'Tamamlandı', 1),
(8, 2, CURRENT_DATE - 3, '13:00', 'Tamamlandı', 4),
(2, 1, CURRENT_DATE - 1, '09:30', 'Tamamlandı', 1),
(1, 1, CURRENT_DATE, '09:30', 'Tamamlandı', 1),
(2, 1, CURRENT_DATE, '11:00', 'Tamamlandı', 2),
(3, 2, CURRENT_DATE, '14:00', 'Bekliyor', 4),
(4, 1, CURRENT_DATE, '15:30', 'Bekliyor', 1),
(6, 2, CURRENT_DATE, '16:45', 'Bekliyor', 3),
(5, 1, CURRENT_DATE + 1, '10:15', 'Bekliyor', 2),
(7, 1, CURRENT_DATE + 2, '12:00', 'Bekliyor', 1);

UPDATE Tedavi t SET Aciklama = v.aciklama, TedaviTurID = v.tur, Tarih = r.Tarih
FROM (VALUES
    (1, 'Karma aşının ikinci dozu yapıldı.', 2),
    (2, 'Kan tahlili: böbrek değerleri sınırda, diyet devam.', 1),
    (3, 'Kulak kontrolü, temiz.', 1),
    (4, 'Diş taşı temizlendi, iki diş çekildi.', 4),
    (5, 'Hafif üst solunum yolu enfeksiyonu.', 1),
    (6, 'Genel kontrol, kilo ideal.', 1),
    (7, 'Kuduz aşısı yapıldı.', 2),
    (8, NULL, 4),
    (9, NULL, 1),
    (10, NULL, 3),
    (11, NULL, 2),
    (12, NULL, 1)
) AS v(randevu, aciklama, tur)
JOIN Randevu r ON r.RandevuID = v.randevu
WHERE t.RandevuID = v.randevu;

INSERT INTO Recete (TedaviID, IlacBilgisi, KullanimTalimati)
SELECT t.TedaviID, v.ilac, v.talimat
FROM (VALUES
    (2, 'Böbrek diyeti mama', 'Günde iki öğün, 6 hafta'),
    (4, 'Ağrı kesici süspansiyon', 'Günde bir kez, 3 gün'),
    (5, 'Antibiyotik süspansiyon', 'Günde iki kez, 7 gün')
) AS v(randevu, ilac, talimat)
JOIN Tedavi t ON t.RandevuID = v.randevu;

INSERT INTO TedaviKayit (TedaviID, Aciklama, Tarih)
SELECT t.TedaviID, 'Telefonla takip: iştahı yerinde.', CURRENT_DATE - 1
FROM Tedavi t WHERE t.RandevuID = 4;

INSERT INTO Stok (UrunAdi, Kategori, Miktar, SonKullanmaTarihi) VALUES
('Karma aşı', 'Aşı', 6, CURRENT_DATE + 120),
('Kuduz aşısı', 'Aşı', 14, CURRENT_DATE + 40),
('Antibiyotik süspansiyon', 'İlaç', 24, CURRENT_DATE + 300),
('Ağrı kesici süspansiyon', 'İlaç', 15, CURRENT_DATE + 200),
('Dış parazit damlası', 'İlaç', 8, CURRENT_DATE + 365),
('Böbrek diyeti mama', 'Mama', 40, CURRENT_DATE + 180);

INSERT INTO StokRecete (StokID, ReceteID)
SELECT s.StokID, rc.ReceteID FROM Stok s JOIN Recete rc ON rc.IlacBilgisi = s.UrunAdi;

INSERT INTO KlinikStok (KlinikID, StokID, Miktar)
SELECT 1, StokID, Miktar FROM Stok;

INSERT INTO KlinikRandevu (KlinikID, RandevuID)
SELECT 1, RandevuID FROM Randevu;
