---
name: stv
description: "Áp dụng chuẩn TVKTĐGH/KHMT khi viết hoặc rà tài liệu KHMT tiếng Việt — rút gọn câu, câu chủ động, giữ thuật ngữ tiếng Anh theo 3 tầng, kiểm tra tuân thủ. Dùng khi viết/viết lại/soát doc, commit message, README, runbook, code review, cảnh báo, API/ML, hoặc gõ /stv."
---

# STV — Viết tài liệu KHMT tiếng Việt theo chuẩn TVKTĐGH/KHMT

Chuẩn ngôn ngữ kiểm soát cho tài liệu khoa học máy tính tiếng Việt, phỏng theo
ASD-STE100. Skill này **không chứa nội dung chuẩn** — nó **kéo bản mới nhất từ
release** rồi áp dụng. Nguồn sự thật duy nhất là repo standard; sửa chuẩn ở đó,
skill tự dùng bản mới.

## Bước 1 — Kéo chuẩn mới nhất (bắt buộc, mỗi lần chạy)

Fetch bản Markdown của chuẩn từ **release mới nhất**:

```
https://github.com/8bu/stv-cs/releases/latest/download/TVKTDGH-KHMT.md
```

- Dùng công cụ web fetch để tải, rồi **đọc toàn bộ** trước khi làm gì.
- Nếu chưa có release (404), fallback bản trên nhánh main:
  `https://raw.githubusercontent.com/8bu/stv-cs/main/spec/TVKTDGH-KHMT.md`
- Nếu cả hai không tải được, báo người dùng và **không đoán** quy tắc từ trí nhớ.

Chuẩn vừa tải là căn cứ duy nhất: quy tắc viết (Phần 1), từ điển 3 tầng (Phần 2),
ví dụ (Phần 3), checklist áp dụng (Phần 4).

## Bước 2 — Chọn chế độ

1. **Rewrite** — người dùng đưa văn bản, viết lại theo chuẩn.
2. **Review** — chấm theo checklist trong chuẩn, chỉ lỗi theo số hiệu quy tắc (vd QT 4.1).

Không rõ thì hỏi một câu: viết lại hay soát lỗi.

## Bước 3 — Áp dụng

- Theo đúng quy tắc và từ điển 3 tầng trong bản vừa tải.
- **Chỉ viết lại cách diễn đạt; giữ đúng và đủ thông tin gốc. Không thêm dữ kiện
  mới** (số liệu, tên biến/lệnh, endpoint, bước). Bản gốc thiếu thông tin mà quy
  tắc đòi hỏi → đánh dấu `[tác giả bổ sung]`, không bịa.
- Ở chế độ review, xuất bảng lỗi: vị trí · số hiệu quy tắc · sửa đề xuất.

## Ghi chú

- Không nhắc lại quy tắc trong skill này. Mọi quy tắc lấy từ chuẩn đã tải, nên
  khi chuẩn cập nhật, skill dùng ngay bản mới mà không cần sửa file này.
- Bản chuẩn theo version của release (vd `v0.1.0`); nêu version đã dùng nếu người
  dùng cần truy vết.
