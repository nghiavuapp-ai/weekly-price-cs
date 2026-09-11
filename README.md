# Price Check Automation

## Nen tang web tu dong

Phien ban cloud moi dat Supabase lam nguon du lieu chinh, GitHub Actions chay crawler
va Vercel phuc vu dashboard React trong thu muc `web/`. Dashboard cong khai chi doc;
nut `Sua gia` o footer mo khu vuc admin bang mat khau Supabase Auth. Admin co the:

- sua gia, ton kho, trang thai review va ghi chu; moi lan sua la mot audit record moi;
- them/tat model, partner, URL san pham va override crawler;
- xem thay doi realtime ma khong build lai website;
- tai `Price Check.xlsx` hoac `Price Check Daily.xlsx` tu du lieu dang hien co.

Du lieu crawler goc la append-only. Sua thu cong chi tac dong observation dung ngay
hoac tuan da chon, khong sua cac ky khac va khong bi crawler tuong lai ghi de.

### Chay web local

```bash
npm --prefix web ci
npm --prefix web run dev
```

Khong co bien moi truong, web dung fixture tao tu workbook de preview. Khi co Supabase,
dat ba bien cong khai `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`,
`VITE_ADMIN_EMAIL` trong Vercel. Email admin khong phai secret; mat khau tuyet doi
khong ghi vao file `.env`, Git hay Vercel build log.

### Khoi tao cloud

1. Tao Supabase project mien phi va chay migration trong `supabase/migrations/`.
2. Tao user trong Supabase Auth, sau do them `user_id` vao `private.admin_users`.
3. Import lich su bang `python3 tools/import_supabase_data.py --apply` sau khi dat
   `SUPABASE_URL` va `SUPABASE_SERVICE_ROLE_KEY` trong shell rieng.
4. Tao GitHub App co quyen Actions `write`, Metadata `read`, cai App chi vao repo nay.
5. Deploy Edge Function `dispatch-price-check`, dat cac secret duoc liet ke trong
   `.env.example`, va luu `dispatcher_url`, `dispatcher_secret` trong Supabase Vault.
6. Ap dung `supabase/seed.sql` de cai ba lich UTC tuong ung Asia/Ho_Chi_Minh:
   primary 11:00 hang ngay, retry 11:30 hang ngay, Weekly 12:00 thu Sau.
7. Dat `SUPABASE_URL` va `SUPABASE_SERVICE_ROLE_KEY` trong GitHub Actions secrets;
   dat ba bien `VITE_*` trong Vercel va deploy repo.

Chay shadow thu cong truoc khi mo lich authoritative:

```bash
gh workflow run price-check.yml -f run_type=shadow
```

Shadow crawl that nhung khong ghi observation. Sau khi doi chieu du 7 ngay, moi coi
lich cloud la nguon authoritative. Nen tang free tier khong co SLA 100%; dashboard
se hien canh bao khi Daily/Weekly tre, retry con loi hoac run bi treo.

Cong cu nay cap nhat file `Price Check.xlsx` tu cac link san pham truc tiep trong `Link Product.xlsx`.

## File dau vao

`Link Product.xlsx`

- Cot A: `Model`
- Cac cot tiep theo: ten he thong, vi du `Viettel`, `MW`, `FPT`, `CPS`, `Shopdunk`
- Moi o trong cot he thong: link truc tiep den trang san pham can lay gia

Tool khong tu search website nua. Neu can them he thong hoac model, cap nhat link truc tiep vao `Link Product.xlsx`.

`Price Overrides.csv` la file tuy chon de khoa gia cho cac link dac biet khi HTML/API cua website tra ve khac voi gia dang hien thi tren trinh duyet. Cot gom:

- `url`: link san pham can override
- `value`: gia dung de ghi vao Excel
- `note`: ly do override de audit lai sau

## Chay cap nhat gia

Neu dung trong Codex, chi can nhan:

```text
price check
```

Codex se tu dung skill `price-check` de chay tron quy trinh tuan: crawl link, ap dung override, back-check case rui ro, ghi `Price Check.xlsx`, tao report va tom tat cac dong can review.

Neu can cap nhat bang theo doi gia online sau khi ghi workbook, Codex se chay them:

```bash
python3 tools/clean_price_data.py
python3 tools/build_clean_dashboard.py
```

Lenh build thu hai tao dashboard tich hop Weekly/Daily. Dashboard mac dinh mo bang
toan bo model iPhone tai tuan Weekly moi nhat, cho phep chuyen tong quan sang ngay,
va hien thi xu huong toi da 13 tuan sau khi chon model. Diem Weekly chi co the bam
khi tuan do co Daily; man hinh Daily hien thi toi da 7 ngay Chu Nhat–Thu Bay.

Daily tren dashboard chi doc snapshot da ghi trong `Price Check Daily.xlsx` / `Run Log`.
Khong co URL hay loi crawl chi tiet trong HTML. De duyet local ma khong deploy:

```bash
python3 tools/clean_price_data.py
python3 tools/build_clean_dashboard.py
python3 -m http.server 8765
```

Sau do mo `http://127.0.0.1:8765/dashboard-gia-ban-le-clean.html`. Khong sao chep
sang thu muc hosting va khong deploy Vercel truoc khi preview duoc duyet.

Folder `/Users/vutrungnghia/Downloads/Codex Projects/Price Check` la source-of-truth cho crawler/workbook. Folder `/Users/vutrungnghia/Downloads/Price Check` chi la ban dashboard/hosting export.

Cap nhat tat ca link trong `Link Product.xlsx`:

```bash
python3 tools/price_check_tool.py
```

Chi cap nhat Viettel:

```bash
python3 tools/price_check_tool.py --retailers Viettel
```

Chi dinh sheet tuan:

```bash
python3 tools/price_check_tool.py --source-sheet W7Q3FY26 --target-sheet W8Q3FY26 --retailers Viettel
```

Chay thu, chi tao report va khong ghi Excel:

```bash
python3 tools/price_check_tool.py --retailers Viettel --dry-run
```

Neu khong muon dung override trong mot lan chay, truyen file override khac hoac file khong ton tai:

```bash
python3 tools/price_check_tool.py --override-file /tmp/no-overrides.csv
```

## Price Check Daily

Daily la quy trinh doc lap, khong ghi vao `Price Check.xlsx` va khong thay the Weekly.
Daily dung chung `Link Product.xlsx`, `Price Overrides.csv` va cac rule lay gia trong
`tools/price_check_tool.py`.

Chay thu cong va cap nhat workbook Daily:

```bash
/Users/vutrungnghia/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 tools/daily_price_check.py --run-type manual
```

Chay thu, tao report nhung khong ghi workbook:

```bash
/Users/vutrungnghia/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3 tools/daily_price_check.py --run-type manual --limit 3 --dry-run
```

Lich van hanh:

- `primary`: 11:00 moi ngay, gom ca cuoi tuan.
- `retry`: 11:30 moi ngay, chi chay lai cac URL loi cua luot primary cung ngay.
- Neu primary khong co loi, retry ket thuc voi trang thai `NO_RETRY` va khong sua workbook.
- Do moi task Codex chi gan mot heartbeat, hai moc tren duoc cau hinh trong cung
  automation `Price Check Daily 11:00 va retry 11:30`.

`Price Check Daily.xlsx` gom:

- `Latest`: trang thai moi nhat theo `Model + Retailer`.
- `Changes`: chi ghi khi gia hoac tinh trang ton kho thay doi.
- `Run Log`: mot dong cho moi luot da ghi workbook.

Lan chay dau tien tao baseline, khong coi toan bo gia la bien dong. Ket qua rui ro
van duoc ghi, to vang va co `Review Status = Pending`. Loi fetch khong ghi de len
gia gan nhat. Gia can sua phai duoc xac nhan trong `Price Overrides.csv`.

Du lieu audit Daily:

- Snapshot day du: `outputs/daily/snapshots/`
- Dong can review: `outputs/daily/reviews/`
- Backup workbook: `outputs/daily/backups/`
- File tam cho browser back-check: `outputs/daily/render/`

Moi luot in mot dong `DAILY_REPORT_JSON=...` de automation doc va gui tom tat vao
task Codex. Primary luon bao cao, ke ca `0 bien dong`; retry chi can thong bao khi
co URL da duoc chay lai hoac van con loi.

## Output

- Tool tao backup truoc khi ghi workbook: `outputs/backups/`
- Report crawl gia nam o: `outputs/reports/price_results_*.csv`
- Report can review nam o: `outputs/reports/review_needed_*.csv` neu co case rui ro.
- Du lieu sach cho dashboard nam o: `outputs/clean-data/`
- Dashboard offline cap nhat nam o: `dashboard-gia-ban-le-clean.html`
- Neu target sheet chua co, tool copy sheet tuan truoc va cap nhat cong thuc so sanh sang tuan moi.
- Neu target sheet da co, tool cap nhat truc tiep vao sheet do.

## Tu kiem va back-check

- Tool crawl HTML truoc, sau do cham diem rui ro truoc khi ghi Excel.
- Cac case rui ro co the duoc back-check bang Chrome render that, nhung chi ap dung cho dong co dau hieu can nghi ngo de tranh chay qua cham.
- Report chinh co them cac cot audit:
  - `final_price`: gia cuoi ghi vao Excel
  - `html_price`: gia tool doc tu HTML/parser
  - `rendered_price`: gia Chrome render doc duoc neu co back-check
  - `previous_week_price`: gia cung model/he thong o tuan truoc
  - `source_method`: cach lay gia
  - `risk_flags`: dau hieu rui ro
  - `confidence`: muc tin cay
  - `decision_note`: ly do quyet dinh hoac ly do can review
- Mac dinh tool van ghi gia vao Excel. Neu gia nghi ngo, o duoc to mau cam va co note audit.
- Neu muon chay nhanh va bo qua Chrome back-check:

```bash
python3 tools/price_check_tool.py --no-back-check
```

## Quy tac ghi gia

- Gia ghi vao Excel la gia ban chinh tren trang san pham.
- Tool uu tien rule rieng theo tung website truoc khi dung rule gia chung:
  - `FPT`: lay gia hien thi sau khu vuc `Gia tai`.
  - `MW`: lay gia hien thi trong khu vuc `Online Gia Re Qua` / `Gia tai`, sau do tru uu dai tien mat dang `Giam gia ...` trong block khuyen mai neu co. Gia cuoi can khop gia goi dich vu/khuyen mai dang hien thi tren trang.
  - `CPS`: ep khu vuc Ha Noi, uu tien gia trong schema/meta offer cua san pham, tranh lay nham gia trong tag hien thi khac.
  - `Shopdunk`: chi lay gia ban goc trong `span id=price-value...` / `new-price` hoac gia ngay truoc dong `(Da bao gom VAT)`, khong lay cac so tien hoan tien, tro gia, trade-in, hay thanh toan trong block uu dai.
- Voi Viettel, tool tru cac uu dai tien mat de ap dung truc tiep nhu:
  - `Giam them ... cho khach hang cu cua Viettel`
  - `Giam them ... cho khach hang` khi website rut gon noi dung uu dai
  - `Giam them ... cho hoc sinh, sinh vien, giao vien`
- Neu gia cuoi cung khac gia cung model o tuan truoc:
  - O duoc to vang.
  - O co note `was ...`.
- Neu gia co dau hieu can review:
  - O duoc to cam.
  - Note co them `html`, `rendered`, `risk`, `confidence`, va ly do quyet dinh.
- Neu gia co tru uu dai truc tiep ngoai MW:
  - Note co them `base`, `discount`, va noi dung uu dai.
  - O chi to vang neu gia cuoi cung thay doi so voi tuan truoc.
- Rieng MW, note chi ghi `was ...` khi gia thay doi.
