const SHEET_NAME = "บันทึกรอบบิล";
const DAILY_DEDUCTION = 25;
const RATE_PER_BILL = 15;

function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};
  const callback = String(params.callback || "");
  try {
    const action = String(params.action || "list").toLowerCase();
    const sheet = getSheet_();
    if (action === "list") {
      const lastRow = sheet.getLastRow();
      const values = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 6).getValues() : [];
      const records = values.filter(row => row[0] !== "" && row[0] !== null).map(row => ({
        date: formatDate_(row[0]),
        totalBills: Number(row[1]) || 0,
        deduction: Number(row[2]) || DAILY_DEDUCTION,
        netBills: Number(row[3]) || 0,
        grossMoney: Number(row[4]) || 0,
        netMoney: Number(row[5]) || 0
      }));
      return output_({success:true, records:records}, callback);
    }
    if (action === "upsert") {
      const date = String(params.date || "");
      const total = Number(params.totalBills);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isInteger(total) || total < 0) {
        return output_({success:false, error:"วันที่หรือจำนวนบิลไม่ถูกต้อง"}, callback);
      }
      const net = Math.max(0, total - DAILY_DEDUCTION);
      const record = [date, total, DAILY_DEDUCTION, net, total * RATE_PER_BILL, net * RATE_PER_BILL];
      const lastRow = sheet.getLastRow();
      const values = lastRow > 1 ? sheet.getRange(2, 1, lastRow - 1, 6).getValues() : [];
      let foundRow = -1;
      for (let i = 0; i < values.length; i++) {
        if (formatDate_(values[i][0]) === date) { foundRow = i + 2; break; }
      }
      if (foundRow > 0) sheet.getRange(foundRow, 1, 1, record.length).setValues([record]);
      else sheet.appendRow(record);
      sheet.getRange("A:A").setNumberFormat("yyyy-mm-dd");
      return output_({success:true}, callback);
    }
    if (action === "delete") {
      const date = String(params.date || "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return output_({success:false, error:"วันที่ไม่ถูกต้อง"}, callback);
      const lastRow = sheet.getLastRow();
      if (lastRow > 1) {
        const values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
        for (let i = values.length - 1; i >= 0; i--) {
          if (formatDate_(values[i][0]) === date) { sheet.deleteRow(i + 2); break; }
        }
      }
      return output_({success:true}, callback);
    }
    return output_({success:false, error:"ไม่รู้จักคำสั่งนี้"}, callback);
  } catch (err) {
    return output_({success:false, error:String(err && err.message ? err.message : err)}, callback);
  }
}

function getSheet_() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty("SPREADSHEET_ID");
  if (!spreadsheetId) throw new Error("ยังไม่ได้ตั้งค่า SPREADSHEET_ID กรุณารัน setupSpreadsheet() ก่อน");
  const ss = SpreadsheetApp.openById(spreadsheetId);
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  const headers = ["วันที่", "บิลทั้งหมด", "หักบิล", "บิลสุทธิ", "เงินก่อนหัก (บาท)", "เงินหลังหัก (บาท)"];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const firstHeader = String(sheet.getRange(1, 1).getDisplayValue()).trim();
    if (firstHeader !== "วันที่" && firstHeader !== "วันที่บันทึก") {
      // Existing sheet did not have a date column: add a new first column.
      sheet.insertColumnBefore(1);
      sheet.getRange(1, 1).setValue("วันที่");
      sheet.getRange(1, 2, 1, headers.length - 1).setValues([headers.slice(1)]);
    } else {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    }
  }
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight("bold");
  sheet.getRange("A:A").setNumberFormat("yyyy-mm-dd");
  return sheet;
}

function formatDate_(value) {
  if (value instanceof Date) return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  const text = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  return text.slice(0, 10);
}

function output_(obj, callback) {
  const json = JSON.stringify(obj);
  if (callback && /^[A-Za-z_$][0-9A-Za-z_$\.]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + "(" + json + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function setupSpreadsheet() {
  const id = "1X6SMFlbNYY0JzghfxuTFCqdpYTkCN2N3yky4q1mXJr0";
  if (id === "ใส่_SPREADSHEET_ID_ตรงนี้") {
    throw new Error("ใส่ Spreadsheet ID จริงใน setupSpreadsheet() ก่อนรัน");
  }
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", id);
  getSheet_();
}
