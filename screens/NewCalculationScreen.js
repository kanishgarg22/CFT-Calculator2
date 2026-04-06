import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  Alert,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

// Constants
const CONVERSION_FACTORS = {
  inches: 1,
  foot: 12,
  mm: 0.0393701,
  soot: 0.125,
};
const CUBIC_INCHES_PER_CFT = 1728;
const UNIT_OPTIONS = [
  { value: 'inches', label: 'In' },
  { value: 'foot', label: 'Ft' },
  { value: 'mm', label: 'Mm' },
  { value: 'soot', label: 'St' },
];

// Helper Functions
const convertToInches = (value, unit) => {
  if (value === '' || value === null || isNaN(Number(value))) return 0;
  const num = parseFloat(value);
  return num * (CONVERSION_FACTORS[unit] || 1);
};

const calculateCFT = (l, w, h, lUnit, wUnit, hUnit) => {
  if (!l || !w || !h || isNaN(l) || isNaN(w) || isNaN(h)) return 0;
  const li = convertToInches(parseFloat(l), lUnit || 'inches');
  const wi = convertToInches(parseFloat(w), wUnit || 'inches');
  const hi = convertToInches(parseFloat(h), hUnit || 'inches');
  return (li * wi * hi) / CUBIC_INCHES_PER_CFT;
};

const formatINR = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0.00';
  return Number(num).toFixed(2);
};

const getUnitLabel = (unitValue) => {
  const unit = UNIT_OPTIONS.find(u => u.value === unitValue);
  return unit ? unit.label : 'In';
};

const sanitizeForHTML = (str) => {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

const sanitizeDecimalInput = (value) => {
  if (value === null || value === undefined) return '';
  let cleaned = value.replace(/[^0-9.]/g, '');
  const parts = cleaned.split('.');
  if (parts.length > 2) {
    cleaned = parts[0] + '.' + parts.slice(1).join('');
  }
  return cleaned;
};

const sanitizeIntegerInput = (value) => {
  if (value === null || value === undefined) return '';
  let cleaned = value.replace(/[^0-9]/g, '');
  if (cleaned.length > 1) {
    cleaned = cleaned.replace(/^0+/, '');
  }
  return cleaned;
};

const sanitizeFileName = (str) => {
  return String(str).replace(/[^a-zA-Z0-9]/g, '_');
};

const defaultRows = Array(7).fill().map((_, i) => ({
  id: i + 1,
  itemName: '',
  length: '',
  width: '',
  height: '',
  lengthUnit: 'inches',
  widthUnit: 'inches',
  heightUnit: 'inches',
  quantity: '',
  pricePerCft: '',
}));

export default function NewCalculationScreen({ navigation, route }) {
  const editRecord = route?.params?.editRecord || null;
  const today = new Date().toLocaleDateString('en-GB');

  const [invoiceNumber, setInvoiceNumber] = useState(
    editRecord ? editRecord.invoiceNumber : `INV-${Date.now().toString().slice(-6)}`
  );
  const [invoiceDate, setInvoiceDate] = useState(
    editRecord ? editRecord.date : today
  );
  const [BuyerName, setBuyerName] = useState(
    editRecord ? (editRecord.buyerName || editRecord.BuyerName || editRecord.customerName || '') : ''
  );
  const [soldByName, setSoldByName] = useState(
    editRecord ? editRecord.soldByName : ''
  );
  const [gstPercent, setGstPercent] = useState(
    editRecord ? String(editRecord.gst || '') : ''
  );
  const [nextId, setNextId] = useState(
    editRecord ? (editRecord.rows.length + 1) : 8
  );
  const [rows, setRows] = useState(
    editRecord
      ? editRecord.rows.map((row, index) => ({
          ...row,
          id: row.id || index + 1,
          lengthUnit: row.lengthUnit || 'inches',
          widthUnit: row.widthUnit || 'inches',
          heightUnit: row.heightUnit || 'inches',
          length: row.length || '',
          width: row.width || '',
          height: row.height || '',
          quantity: row.quantity || '',
          pricePerCft: row.pricePerCft || '',
        }))
      : [...defaultRows]
  );
  const [additionalCharges, setAdditionalCharges] = useState(
    editRecord
      ? (editRecord.additionalCharges || []).map(c => ({
          ...c,
          type: c.type || 'plus',
        }))
      : []
  );
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [unitTarget, setUnitTarget] = useState({ row: -1, field: '' });

  // --- Calculation Logic ---
  const getRowCalculations = (row) => {
    const length = parseFloat(row.length) || 0;
    const width = parseFloat(row.width) || 0;
    const height = parseFloat(row.height) || 0;
    const quantity = parseFloat(row.quantity) || 0;
    const pricePerCft = parseFloat(row.pricePerCft) || 0;

    if (length === 0 || width === 0 || height === 0) {
      return { cft: 0, qty: quantity, rate: pricePerCft, totalCft: 0, amount: 0 };
    }

    const cft = calculateCFT(
      String(length),
      String(width),
      String(height),
      row.lengthUnit || 'inches',
      row.widthUnit || 'inches',
      row.heightUnit || 'inches'
    );
    const totalCft = cft * quantity;
    const amount = totalCft * pricePerCft;
    return { cft, qty: quantity, rate: pricePerCft, totalCft, amount };
  };

  const getTableTotals = useCallback(() => {
    let totalCFT = 0;
    let totalTCFT = 0;
    let totalAmount = 0;

    rows.forEach((row) => {
      const length = parseFloat(row.length) || 0;
      const width = parseFloat(row.width) || 0;
      const height = parseFloat(row.height) || 0;

      if (length > 0 && width > 0 && height > 0) {
        const { cft, totalCft, amount } = getRowCalculations(row);
        totalCFT += cft;
        totalTCFT += totalCft;
        totalAmount += amount;
      }
    });

    return { totalCFT, totalTCFT, totalAmount };
  }, [rows]);

  const tableTotals = getTableTotals();

  const totals = useMemo(() => {
    let totalCFT = 0;
    let subtotal = 0;

    rows.forEach((row) => {
      const length = parseFloat(row.length) || 0;
      const width = parseFloat(row.width) || 0;
      const height = parseFloat(row.height) || 0;

      if (length > 0 && width > 0 && height > 0) {
        const { totalCft, amount } = getRowCalculations(row);
        totalCFT += totalCft;
        subtotal += amount;
      }
    });

    const misc = additionalCharges.reduce((sum, charge) => {
      const amount = parseFloat(charge.amount) || 0;
      return charge.type === 'minus' ? sum - amount : sum + amount;
    }, 0);

    const gstValue = parseFloat(gstPercent) || 0;
    const gstAmt = (subtotal + misc) * (gstValue / 100);
    const grandTotal = subtotal + misc + gstAmt;

    return {
      totalCFT,
      subtotal,
      misc,
      gstAmt,
      grandTotal,
    };
  }, [rows, gstPercent, additionalCharges]);

  const t = totals;

  // --- Row Management ---
  const addRow = () => {
    const lastRow = rows[rows.length - 1];
    setRows([
      ...rows,
      {
        id: nextId,
        itemName: '',
        length: '',
        width: '',
        height: '',
        lengthUnit: lastRow?.lengthUnit || 'inches',
        widthUnit: lastRow?.widthUnit || 'inches',
        heightUnit: lastRow?.heightUnit || 'inches',
        quantity: '',
        pricePerCft: lastRow?.pricePerCft || '',
      },
    ]);
    setNextId(nextId + 1);
  };

  const deleteRow = (index) => {
    if (rows.length <= 7) {
      Alert.alert('Cannot Delete', 'Minimum 7 rows required. Use Clear instead.');
      return;
    }
    Alert.alert('Delete Row', `Delete Row ${index + 1}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => setRows(rows.filter((_, i) => i !== index)),
      },
    ]);
  };

  const copyRow = (fromIndex, toIndex) => {
    const src = rows[fromIndex];
    const newRows = [...rows];
    newRows[toIndex] = {
      ...newRows[toIndex],
      itemName: src.itemName || '',
      length: src.length || '',
      width: src.width || '',
      height: src.height || '',
      lengthUnit: src.lengthUnit || 'inches',
      widthUnit: src.widthUnit || 'inches',
      heightUnit: src.heightUnit || 'inches',
      quantity: src.quantity || '',
      pricePerCft: src.pricePerCft || '',
    };
    setRows(newRows);
  };

  const clearRow = (index) => {
    const newRows = [...rows];
    newRows[index] = {
      ...newRows[index],
      itemName: '',
      length: '',
      width: '',
      height: '',
      quantity: '',
      pricePerCft: '',
    };
    setRows(newRows);
  };

  const updateRow = (index, field, value) => {
    const newRows = [...rows];
    newRows[index] = {
      ...newRows[index],
      [field]: value,
    };
    setRows(newRows);
  };

  // --- Charge Management ---
  const addCharge = () => {
    setAdditionalCharges([
      ...additionalCharges,
      { id: Date.now(), label: '', amount: '', type: 'plus' },
    ]);
  };

  const updateCharge = (index, field, value) => {
    const newCharges = [...additionalCharges];
    newCharges[index] = { ...newCharges[index], [field]: value };
    setAdditionalCharges(newCharges);
  };

  const removeCharge = (index) => {
    setAdditionalCharges((prev) => prev.filter((_, i) => i !== index));
  };

  // --- Unit Selection ---
  const openUnitSelector = (rowIndex, unitField) => {
    setUnitTarget({ row: rowIndex, field: unitField });
    setShowUnitModal(true);
  };

  const selectUnit = (unitValue) => {
    updateRow(unitTarget.row, unitTarget.field, unitValue);
    setShowUnitModal(false);
  };

  // --- Save Record ---
  const saveRecord = async () => {
    if (!BuyerName.trim()) {
      Alert.alert('Error', 'Please enter Buyer Name');
      return;
    }

    try {
      const normalizedRows = rows.map((row) => ({
        ...row,
        length: row.length || '',
        width: row.width || '',
        height: row.height || '',
        quantity: row.quantity || '',
      }));

      const record = {
        id: editRecord ? editRecord.id : Date.now(),
        invoiceNumber,
        date: invoiceDate,
        BuyerName: BuyerName.trim(),
        buyerName: BuyerName.trim(),
        customerName: BuyerName.trim(),
        soldByName: soldByName.trim(),
        gst: parseFloat(gstPercent) || 0,
        rows: normalizedRows,
        additionalCharges: [...additionalCharges],
        totals: t,
      };

      const savedRecords = await AsyncStorage.getItem('cftRecords');
      let records = savedRecords ? JSON.parse(savedRecords) : [];

      if (editRecord) {
        records = records.map((r) => (r.id === editRecord.id ? record : r));
        Alert.alert('Success', 'Record updated successfully!');
      } else {
        records.unshift(record);
        Alert.alert('Success', 'Record saved successfully!');
      }

      await AsyncStorage.setItem('cftRecords', JSON.stringify(records));
      navigation.navigate('Records');
    } catch (e) {
      Alert.alert('Error', 'Failed to save record');
      console.error(e);
    }
  };

  // --- PDF Generation ---
  const generatePDF = async () => {
    try {
      let rowsHTML = '';
      let rowNumber = 0;
      let grandTotalCFT = 0;
      let grandTotalTCFT = 0;
      let grandTotalAmount = 0;

      rows.forEach((row) => {
        const length = parseFloat(row.length) || 0;
        const width = parseFloat(row.width) || 0;
        const height = parseFloat(row.height) || 0;

        if (length > 0 && width > 0 && height > 0) {
          rowNumber++;
          const { cft, qty, rate, totalCft, amount } = getRowCalculations(row);
          grandTotalCFT += cft;
          grandTotalTCFT += totalCft;
          grandTotalAmount += amount;

          rowsHTML += `
            <tr>
              <td style="border: 1px solid #000; padding: 5px 2px; text-align: center;">${rowNumber}</td>
              <td style="border: 1px solid #000; padding: 5px 4px; text-align: left;">${sanitizeForHTML(row.itemName || '-')}</td>
              <td style="border: 1px solid #000; padding: 5px 2px; text-align: center;">${length}<br><span style="font-size: 8px; color: #555;">${getUnitLabel(row.lengthUnit)}</span></td>
              <td style="border: 1px solid #000; padding: 5px 2px; text-align: center;">${width}<br><span style="font-size: 8px; color: #555;">${getUnitLabel(row.widthUnit)}</span></td>
              <td style="border: 1px solid #000; padding: 5px 2px; text-align: center;">${height}<br><span style="font-size: 8px; color: #555;">${getUnitLabel(row.heightUnit)}</span></td>
              <td style="border: 1px solid #000; padding: 5px 2px; text-align: center;">${cft.toFixed(4)}</td>
              <td style="border: 1px solid #000; padding: 5px 2px; text-align: center;">${qty}</td>
              <td style="border: 1px solid #000; padding: 5px 2px; text-align: center; font-weight: bold;">${totalCft.toFixed(4)}</td>
              <td style="border: 1px solid #000; padding: 5px 4px; text-align: right;">${formatINR(rate)}</td>
              <td style="border: 1px solid #000; padding: 5px 4px; text-align: right; font-weight: bold;">${formatINR(amount)}</td>
            </tr>`;
        }
      });

      if (rowsHTML === '') {
        rowsHTML = '<tr><td colspan="10" style="text-align:center; padding:20px; border:1px solid #000;">No items added</td></tr>';
      }

      let chargesHtml = '';
      additionalCharges.forEach((charge) => {
        if (charge.amount) {
          chargesHtml += `
            <tr>
              <td style="padding: 4px 0; border-bottom: 1px dashed #999;">${sanitizeForHTML(charge.label || 'Charge')} (${charge.type === 'minus' ? '-' : '+'})</td>
              <td style="padding: 4px 0; border-bottom: 1px dashed #999; text-align: right; font-weight: bold;">Rs. ${formatINR(parseFloat(charge.amount) || 0)}</td>
            </tr>`;
        }
      });

      const customerDisplay = BuyerName ? BuyerName.trim() : 'Customer';
      const cleanBuyerName = sanitizeFileName(customerDisplay);
      const cleanInvoiceNumber = sanitizeFileName(invoiceNumber);
      const fileName = `Invoice_${cleanBuyerName}_${cleanInvoiceNumber}.pdf`;

      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice - ${sanitizeForHTML(customerDisplay)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
  <style>
    @page { margin: 15px; size: A4 portrait; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: #000; background: #fff; padding: 15px; }
    table { width: 100%; table-layout: fixed; border-collapse: collapse; }
    td, th { vertical-align: top; }
    .header-box { text-align: center; margin-bottom: 20px; border-bottom: 3px double #000; padding-bottom: 10px; }
    .header-title { font-size: 24px; font-weight: bold; letter-spacing: 1px; margin: 0; }
    .info-title { font-weight: bold; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 5px; }
    .items-table { margin: 15px 0; }
    .items-table th { background-color: #333; color: #fff; border: 1px solid #000; padding: 6px 2px; text-align: center; font-size: 10px; text-transform: uppercase; }
    .items-table tr:nth-child(even) td { background-color: #f9f9f9; }
    .totals-box { border: 1px solid #000; padding: 10px; }
    .footer-area { margin-top: 30px; border-top: 1px solid #000; padding-top: 20px; font-size: 10px; }
  </style>
</head>
<body>

  <div class="header-box">
    <h1 class="header-title">INVOICE</h1>
    <p style="margin-top: 4px; font-size: 10px; color: #444;">CFT Calculator Pro - Professional Material Details</p>
  </div>

  <table style="margin-bottom: 15px;">
    <tr>
      <td style="width: 48%; border: 1px solid #000; padding: 10px;">
        <div class="info-title">Invoice Details</div>
        <table style="width: 100%;">
          <tr><td style="width: 80px; font-weight: bold; padding: 3px 0;">Date:</td><td style="padding: 3px 0;">${invoiceDate}</td></tr>
          <tr><td style="width: 80px; font-weight: bold; padding: 3px 0;">Invoice #:</td><td style="padding: 3px 0;">${invoiceNumber}</td></tr>
        </table>
      </td>
      <td style="width: 4%;"></td>
      <td style="width: 48%; border: 1px solid #000; padding: 10px;">
        <div class="info-title">Party Details</div>
        <table style="width: 100%;">
          <tr><td style="width: 60px; font-weight: bold; padding: 3px 0;">Buyer:</td><td style="padding: 3px 0; font-weight: bold;">${sanitizeForHTML(customerDisplay)}</td></tr>
          <tr><td style="width: 60px; font-weight: bold; padding: 3px 0;">Seller:</td><td style="padding: 3px 0;">${sanitizeForHTML(soldByName || 'N/A')}</td></tr>
        </table>
      </td>
    </tr>
  </table>

  <div style="font-weight: bold; font-size: 12px; margin-bottom: 5px;">MATERIAL BREAKDOWN</div>
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 4%;">#</th>
        <th style="width: 22%; text-align: left;">Item Name</th>
        <th style="width: 7%;">L</th>
        <th style="width: 7%;">W</th>
        <th style="width: 7%;">H</th>
        <th style="width: 9%;">CFT</th>
        <th style="width: 6%;">Qty</th>
        <th style="width: 10%;">T.CFT</th>
        <th style="width: 13%;">Rate (Rs)</th>
        <th style="width: 15%;">Amount (Rs)</th>
      </tr>
    </thead>
    <tbody>
      ${rowsHTML}
      ${rowNumber > 0 ? `
      <tr style="background-color: #e0e0e0;">
        <td colspan="7" style="border: 1px solid #000; padding: 8px; text-align: right; font-weight: bold;">GRAND TOTAL</td>
        <td style="border: 1px solid #000; padding: 8px 2px; text-align: center; font-weight: bold;">${grandTotalTCFT.toFixed(4)}</td>
        <td style="border: 1px solid #000;"></td>
        <td style="border: 1px solid #000; padding: 8px 4px; text-align: right; font-weight: bold;">Rs. ${formatINR(grandTotalAmount)}</td>
      </tr>` : ''}
    </tbody>
  </table>

  <table style="margin-top: 15px;">
    <tr>
      <td style="width: 48%;" class="totals-box">
        <div class="info-title">Calculation Summary</div>
        <table style="width: 100%;">
          <tr>
            <td style="padding: 4px 0; border-bottom: 1px dashed #999;">Total CFT:</td>
            <td style="padding: 4px 0; border-bottom: 1px dashed #999; text-align: right; font-weight: bold;">${t.totalCFT.toFixed(4)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; border-bottom: 1px dashed #999;">Subtotal Amount:</td>
            <td style="padding: 4px 0; border-bottom: 1px dashed #999; text-align: right; font-weight: bold;">Rs. ${formatINR(t.subtotal)}</td>
          </tr>
          ${chargesHtml}
          ${gstPercent ? `
          <tr>
            <td style="padding: 4px 0; border-bottom: 1px dashed #999;">GST (${gstPercent}%):</td>
            <td style="padding: 4px 0; border-bottom: 1px dashed #999; text-align: right; font-weight: bold;">Rs. ${formatINR(t.gstAmt)}</td>
          </tr>` : ''}
          <tr>
            <td style="padding: 8px 0 0 0; font-weight: bold; font-size: 13px;">GRAND TOTAL:</td>
            <td style="padding: 8px 0 0 0; text-align: right; font-weight: bold; font-size: 13px;">Rs. ${formatINR(t.grandTotal)}</td>
          </tr>
        </table>
      </td>
      <td style="width: 4%;"></td>
      <td style="width: 48%;" class="totals-box">
        <div class="info-title">Final Payable</div>
        <table style="width: 100%;">
          <tr>
            <td style="padding: 4px 0; border-bottom: 1px dashed #999;">Add & Sub Charges:</td>
            <td style="padding: 4px 0; border-bottom: 1px dashed #999; text-align: right; font-weight: bold;">Rs. ${formatINR(t.misc)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; border-bottom: 1px dashed #999;">Total GST:</td>
            <td style="padding: 4px 0; border-bottom: 1px dashed #999; text-align: right; font-weight: bold;">Rs. ${formatINR(t.gstAmt)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0 0 0; font-weight: bold; font-size: 14px;">FINAL TOTAL:</td>
            <td style="padding: 8px 0 0 0; text-align: right; font-weight: bold; font-size: 14px;">Rs. ${formatINR(t.grandTotal)}</td>
          </tr>
        </table>
      </td>
    </tr>
  </table>

  <div class="footer-area">
    <table style="width: 100%; text-align: center;">
      <tr>
        <td style="width: 33%; vertical-align: bottom;">
          <div style="border-top: 1px solid #000; width: 130px; margin: 0 auto; padding-top: 5px;">Customer Signature</div>
        </td>
        <td style="width: 34%; vertical-align: bottom; color: #555;">
          Thank you for your business!
        </td>
        <td style="width: 33%; vertical-align: bottom;">
          <div style="border-top: 1px solid #000; width: 130px; margin: 0 auto; padding-top: 5px;">Authorized Signature</div>
        </td>
      </tr>
    </table>
  </div>

</body>
</html>`;

      const { uri } = await Print.printToFileAsync({
        html: htmlContent,
        base64: false,
      });

      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = uri;
        link.download = fileName;
        link.click();
        Alert.alert('Success', 'PDF Downloaded!');
        return;
      }

      const destinationPath = `${FileSystem.documentDirectory}${fileName}`;

      try {
        await FileSystem.copyAsync({ from: uri, to: destinationPath });
      } catch (e) {
        Alert.alert('Error', 'Failed to save PDF');
        console.error('FileSystem Error:', e);
        return;
      }

      Alert.alert('PDF Saved!', 'What would you like to do?', [
        { text: 'Done', style: 'cancel' },
        {
          text: 'Share PDF',
          onPress: async () => {
            try {
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(destinationPath);
              } else {
                Alert.alert('Error', 'Sharing not available');
              }
            } catch (e) {
              Alert.alert('Error', 'Failed to share PDF');
              console.error('Sharing Error:', e);
            }
          },
        },
      ]);
    } catch (e) {
      Alert.alert('Error', 'Failed to generate PDF');
      console.error('PDF Error:', e);
    }
  };

  // --- Render ---
  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
    >
      <ScrollView
        style={styles.scrollContainer}
        nestedScrollEnabled={true}
        showsVerticalScrollIndicator={true}
        bounces={true}
        keyboardShouldPersistTaps="handled"
      >
        {editRecord && (
          <View style={styles.editBanner}>
            <Text style={styles.editBannerText}>
              Editing: {editRecord.invoiceNumber}
            </Text>
          </View>
        )}

        {/* Invoice Details Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Invoice Details</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Date:</Text>
            <TextInput
              value={invoiceDate}
              onChangeText={setInvoiceDate}
              style={styles.input}
              placeholder="DD/MM/YYYY"
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Invoice #:</Text>
            <TextInput
              value={invoiceNumber}
              onChangeText={setInvoiceNumber}
              style={styles.input}
            />
          </View>
        </View>

        {/* Customer & Seller Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer & Seller</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Buyer:</Text>
            <TextInput
              value={BuyerName}
              onChangeText={setBuyerName}
              placeholder="Buyer name"
              style={styles.input}
            />
          </View>
          <View style={styles.row}>
            <Text style={styles.label}>Seller:</Text>
            <TextInput
              value={soldByName}
              onChangeText={setSoldByName}
              placeholder="Your company name"
              style={styles.input}
            />
          </View>
        </View>

        {/* Items Table Section */}
        <View style={styles.section}>
          <View style={styles.itemsHeader}>
            <Text style={styles.sectionTitle}>Items ({rows.length} Rows)</Text>
          </View>
          <View style={styles.tableContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={true}
              nestedScrollEnabled={true}
              bounces={true}
              decelerationRate="fast"
              scrollEventThrottle={16}
            >
              <View>
                {/* CHANGE 1: Removed Actions column from header */}
                <View style={styles.tableHeader}>
                  <Text style={[styles.thCell, { width: 35 }]}>#</Text>
                  <Text style={[styles.thCell, { width: 100 }]}>Item</Text>
                  <Text style={[styles.thCell, { width: 90 }]}>Length</Text>
                  <Text style={[styles.thCell, { width: 90 }]}>Width</Text>
                  <Text style={[styles.thCell, { width: 90 }]}>Height</Text>
                  <Text style={[styles.thCell, { width: 75 }]}>CFT</Text>
                  <Text style={[styles.thCell, { width: 60 }]}>Qty</Text>
                  <Text style={[styles.thCell, { width: 80 }]}>T.CFT</Text>
                  <Text style={[styles.thCell, { width: 95 }]}>Rate</Text>
                  <Text style={[styles.thCell, { width: 95 }]}>Amount</Text>
                </View>

                {rows.map((row, index) => {
                  const { cft, totalCft, amount } = getRowCalculations(row);
                  return (
                    <View
                      key={row.id || index}
                      style={[styles.tableRow, index % 2 === 0 ? styles.evenRow : null]}
                    >
                      <Text style={[styles.tdCell, { width: 35 }]}>{index + 1}</Text>

                      <TextInput
                        value={row.itemName}
                        onChangeText={(v) => updateRow(index, 'itemName', v)}
                        placeholder="Item"
                        style={[styles.tdInput, { width: 100 }]}
                        placeholderTextColor="#999"
                      />

                      <View style={styles.dimCell}>
                        <TextInput
                          value={row.length}
                          onChangeText={(v) => updateRow(index, 'length', sanitizeDecimalInput(v))}
                          keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'decimal-pad'}
                          placeholder="0"
                          style={styles.dimInput}
                          placeholderTextColor="#999"
                        />
                        <TouchableOpacity
                          onPress={() => openUnitSelector(index, 'lengthUnit')}
                          style={styles.unitBtn}
                        >
                          <Text style={styles.unitBtnText}>
                            {getUnitLabel(row.lengthUnit)}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.dimCell}>
                        <TextInput
                          value={row.width}
                          onChangeText={(v) => updateRow(index, 'width', sanitizeDecimalInput(v))}
                          keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'decimal-pad'}
                          placeholder="0"
                          style={styles.dimInput}
                          placeholderTextColor="#999"
                        />
                        <TouchableOpacity
                          onPress={() => openUnitSelector(index, 'widthUnit')}
                          style={styles.unitBtn}
                        >
                          <Text style={styles.unitBtnText}>
                            {getUnitLabel(row.widthUnit)}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.dimCell}>
                        <TextInput
                          value={row.height}
                          onChangeText={(v) => updateRow(index, 'height', sanitizeDecimalInput(v))}
                          keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'decimal-pad'}
                          placeholder="0"
                          style={styles.dimInput}
                          placeholderTextColor="#999"
                        />
                        <TouchableOpacity
                          onPress={() => openUnitSelector(index, 'heightUnit')}
                          style={styles.unitBtn}
                        >
                          <Text style={styles.unitBtnText}>
                            {getUnitLabel(row.heightUnit)}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      <Text style={[styles.tdCell, { width: 75, fontSize: 11 }]}>
                        {cft.toFixed(4)}
                      </Text>

                      <TextInput
                        value={row.quantity}
                        onChangeText={(v) => updateRow(index, 'quantity', sanitizeIntegerInput(v))}
                        keyboardType={Platform.OS === 'ios' ? 'number-pad' : 'numeric'}
                        placeholder="0"
                        style={[styles.tdInput, { width: 60 }]}
                        placeholderTextColor="#999"
                      />

                      <Text style={[styles.tdCell, { width: 80, fontSize: 11 }]}>
                        {totalCft.toFixed(4)}
                      </Text>

                      <View style={[styles.amountCell, { width: 95 }]}>
                        <Text style={styles.rupeeSign}>₹</Text>
                        <TextInput
                          value={row.pricePerCft}
                          onChangeText={(v) => updateRow(index, 'pricePerCft', sanitizeDecimalInput(v))}
                          keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'decimal-pad'}
                          placeholder="0.00"
                          style={styles.amountInput}
                          placeholderTextColor="#999"
                        />
                      </View>

                      <View style={[styles.amountDisplayCell, { width: 95 }]}>
                        <Text style={styles.rupeeSign}>₹</Text>
                        <Text style={styles.amountText}>{formatINR(amount)}</Text>
                      </View>

                      {/* CHANGE 1: Removed actionBtns View entirely */}
                    </View>
                  );
                })}

                {/* CHANGE 1: Removed Actions empty cell from total row */}
                <View style={styles.tableTotalRow}>
                  <View style={[styles.totalEmptyCell, { width: 35 }]} />
                  <View style={[styles.totalEmptyCell, { width: 100 }]} />
                  <View style={[styles.totalEmptyCell, { width: 90 }]} />
                  <View style={[styles.totalEmptyCell, { width: 90 }]} />
                  <View style={[styles.totalLabelCell, { width: 90 }]}>
                    <Text style={styles.totalLabelText}>TOTAL</Text>
                  </View>
                  <View style={[styles.totalValueCell, { width: 75 }]}>
                    <Text style={styles.totalValueText}>
                      {tableTotals.totalCFT.toFixed(4)}
                    </Text>
                  </View>
                  <View style={[styles.totalEmptyCell, { width: 60 }]} />
                  <View style={[styles.totalValueCell, { width: 80 }]}>
                    <Text style={styles.totalValueText}>
                      {tableTotals.totalTCFT.toFixed(4)}
                    </Text>
                  </View>
                  <View style={[styles.totalAmountCell, { width: 95 }]}>
                    <Text style={styles.totalRupee}>₹</Text>
                    <Text style={styles.totalAmountText}>
                      {formatINR(tableTotals.totalAmount)}
                    </Text>
                  </View>
                  <View style={[styles.totalEmptyCell, { width: 95 }]} />
                </View>
              </View>
            </ScrollView>
          </View>

          <TouchableOpacity onPress={addRow} style={styles.bottomAddBtn}>
            <Text style={styles.bottomAddBtnText}>+ Add Another Row</Text>
          </TouchableOpacity>
        </View>

        {/* GST Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>GST</Text>
          <View style={styles.row}>
            <Text style={styles.label}>GST %:</Text>
            <TextInput
              value={gstPercent}
              onChangeText={(v) => setGstPercent(sanitizeDecimalInput(v))}
              placeholder="Enter GST %"
              keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'decimal-pad'}
              style={styles.input}
              placeholderTextColor="#999"
            />
          </View>
        </View>

        {/* Additional Charges Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>ADD & SUB charges</Text>
          {additionalCharges.map((charge, index) => (
            <View key={charge.id} style={styles.chargeRow}>
              <TextInput
                value={charge.label}
                onChangeText={(v) => updateCharge(index, 'label', v)}
                placeholder="Description"
                style={[styles.input, { flex: 2, marginRight: 8 }]}
                placeholderTextColor="#999"
              />

              {/* CHANGE 2: Both + and - buttons side by side */}
              <View style={styles.plusMinusBtnGroup}>
                <TouchableOpacity
                  onPress={() => updateCharge(index, 'type', 'plus')}
                  style={[
                    styles.plusMinusBtn,
                    styles.plusBtn,
                    charge.type === 'plus' ? styles.activeBtn : styles.inactiveBtn,
                  ]}
                >
                  <Text style={styles.plusMinusText}>+</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => updateCharge(index, 'type', 'minus')}
                  style={[
                    styles.plusMinusBtn,
                    styles.minusBtn,
                    charge.type === 'minus' ? styles.activeBtn : styles.inactiveBtn,
                  ]}
                >
                  <Text style={styles.plusMinusText}>-</Text>
                </TouchableOpacity>
              </View>

              <TextInput
                value={charge.amount}
                onChangeText={(v) => updateCharge(index, 'amount', sanitizeDecimalInput(v))}
                placeholder="Amount"
                keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'decimal-pad'}
                style={[styles.input, { flex: 1, marginLeft: 8 }]}
                placeholderTextColor="#999"
              />

              <TouchableOpacity
                onPress={() => removeCharge(index)}
                style={styles.removeBtn}
              >
                <Text style={styles.removeBtnText}>Remove</Text>
              </TouchableOpacity>
            </View>
          ))}
          <TouchableOpacity onPress={addCharge} style={styles.addBtn}>
            <Text style={styles.addBtnText}>+ Add Charge</Text>
          </TouchableOpacity>
        </View>

        {/* Totals Section */}
        <View style={styles.totalsSection}>
          <Text style={styles.sectionTitle}>Invoice Totals</Text>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total CFT:</Text>
            <Text style={styles.totalValue}>{t.totalCFT.toFixed(4)}</Text>
          </View>

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal:</Text>
            <View style={styles.totalRupeeRow}>
              <Text style={styles.totalRupeeSign}>₹</Text>
              <Text style={styles.totalValue}>{formatINR(t.subtotal)}</Text>
            </View>
          </View>

          {additionalCharges.length > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Net ADD & SUB charges:</Text>
              <View style={styles.totalRupeeRow}>
                <Text style={styles.totalRupeeSign}>₹</Text>
                <Text style={styles.totalValue}>{formatINR(t.misc)}</Text>
              </View>
            </View>
          )}

          {gstPercent ? (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>GST ({gstPercent}%):</Text>
              <View style={styles.totalRupeeRow}>
                <Text style={styles.totalRupeeSign}>₹</Text>
                <Text style={styles.totalValue}>{formatINR(t.gstAmt)}</Text>
              </View>
            </View>
          ) : null}

          <View style={[styles.totalRow, styles.grandTotalRow]}>
            <Text style={styles.grandTotalLabel}>Grand Total:</Text>
            <View style={styles.totalRupeeRow}>
              <Text style={styles.grandRupeeSign}>₹</Text>
              <Text style={styles.grandTotalValue}>{formatINR(t.grandTotal)}</Text>
            </View>
          </View>
        </View>

        {/* Buttons */}
        <View style={styles.btnContainer}>
          <TouchableOpacity onPress={generatePDF} style={styles.pdfBtn}>
            <Text style={styles.btnText}>Generate PDF</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={saveRecord} style={styles.saveBtn}>
            <Text style={styles.btnText}>
              {editRecord ? 'Update Record' : 'Save Record'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => navigation.navigate('Records')}
            style={styles.recordsBtn}
          >
            <Text style={styles.btnText}>View Records</Text>
          </TouchableOpacity>
        </View>

        {/* Unit Modal */}
        <Modal
          visible={showUnitModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowUnitModal(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalBox}>
              <Text style={styles.modalTitle}>Select Unit</Text>
              {UNIT_OPTIONS.map((unit) => (
                <TouchableOpacity
                  key={unit.value}
                  onPress={() => selectUnit(unit.value)}
                  style={styles.modalOption}
                >
                  <Text style={styles.modalOptionText}>
                    {unit.label} ({unit.value})
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => setShowUnitModal(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F0',
  },
  scrollContainer: {
    flex: 1,
  },
  editBanner: {
    backgroundColor: '#D1A980',
    padding: 12,
    alignItems: 'center',
  },
  editBannerText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 15,
  },
  section: {
    backgroundColor: '#FFFFFF',
    margin: 10,
    padding: 15,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#E5E0D8',
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
    color: '#748873',
  },
  itemsHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 8,
  },
  label: {
    width: 110,
    fontSize: 14,
    color: '#555',
    fontWeight: '600',
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#D1A980',
    padding: 10,
    borderRadius: 6,
    fontSize: 14,
    backgroundColor: '#FAFAF5',
    color: '#333',
  },
  tableContainer: {
    borderRadius: 6,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E5E0D8',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#748873',
    paddingVertical: 10,
  },
  thCell: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 11,
    textAlign: 'center',
    paddingHorizontal: 2,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E0D8',
    paddingVertical: 6,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  evenRow: {
    backgroundColor: '#FAFAF5',
  },
  tdCell: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 2,
    color: '#333',
  },
  tdInput: {
    borderWidth: 1,
    borderColor: '#D1A980',
    padding: 6,
    borderRadius: 4,
    fontSize: 12,
    textAlign: 'center',
    marginHorizontal: 2,
    backgroundColor: '#FFF',
    minHeight: 32,
    color: '#333',
  },
  dimCell: {
    width: 90,
    paddingHorizontal: 3,
  },
  dimInput: {
    borderWidth: 1,
    borderColor: '#D1A980',
    padding: 6,
    borderRadius: 4,
    fontSize: 12,
    textAlign: 'center',
    backgroundColor: '#FFF',
    marginBottom: 4,
    minHeight: 32,
    color: '#333',
  },
  unitBtn: {
    backgroundColor: '#748873',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 26,
  },
  unitBtnText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '700',
    textAlign: 'center',
  },
  amountCell: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#D1A980',
    borderRadius: 4,
    backgroundColor: '#FFF',
    marginHorizontal: 2,
    paddingLeft: 5,
    minHeight: 32,
  },
  rupeeSign: {
    fontSize: 12,
    fontWeight: '700',
    color: '#748873',
    marginRight: 3,
  },
  amountInput: {
    flex: 1,
    fontSize: 12,
    padding: 4,
    textAlign: 'right',
    paddingRight: 6,
    minWidth: 50,
    color: '#333',
  },
  amountDisplayCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 6,
    paddingHorizontal: 2,
    minWidth: 95,
  },
  amountText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#748873',
    marginLeft: 3,
  },
  tableTotalRow: {
    flexDirection: 'row',
    backgroundColor: '#E5E0D8',
    borderTopWidth: 2.5,
    borderTopColor: '#748873',
    alignItems: 'center',
    paddingVertical: 10,
  },
  totalEmptyCell: {
    paddingHorizontal: 2,
  },
  totalLabelCell: {
    paddingHorizontal: 4,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  totalLabelText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#748873',
    letterSpacing: 0.5,
  },
  totalValueCell: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  totalValueText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#333',
    textAlign: 'center',
  },
  totalAmountCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 6,
    paddingHorizontal: 2,
  },
  totalRupee: {
    fontSize: 13,
    fontWeight: '800',
    color: '#748873',
    marginRight: 3,
  },
  totalAmountText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#748873',
  },
  bottomAddBtn: {
    backgroundColor: '#748873',
    padding: 12,
    borderRadius: 6,
    marginTop: 12,
    alignItems: 'center',
  },
  bottomAddBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  chargeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 5,
  },
  // CHANGE 2: New group container for side-by-side + and - buttons
  plusMinusBtnGroup: {
    flexDirection: 'row',
    gap: 4,
  },
  plusMinusBtn: {
    width: 36,
    height: 42,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  plusBtn: {
    backgroundColor: '#5A8F5A',
  },
  minusBtn: {
    backgroundColor: '#B0855A',
  },
  // Active button is fully opaque, inactive is dimmed
  activeBtn: {
    opacity: 1,
  },
  inactiveBtn: {
    opacity: 0.35,
  },
  plusMinusText: {
    color: '#FFF',
    fontSize: 22,
    fontWeight: '800',
    lineHeight: 24,
  },
  removeBtn: {
    backgroundColor: '#B0855A',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 4,
    marginLeft: 10,
  },
  removeBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  addBtn: {
    backgroundColor: '#748873',
    padding: 10,
    borderRadius: 4,
    alignItems: 'center',
    marginTop: 10,
  },
  addBtnText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  totalsSection: {
    backgroundColor: '#FFFFFF',
    margin: 10,
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1A980',
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EBE3',
  },
  totalRupeeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  totalRupeeSign: {
    fontSize: 14,
    fontWeight: '700',
    color: '#748873',
    marginRight: 2,
  },
  grandRupeeSign: {
    fontSize: 17,
    fontWeight: '800',
    color: '#748873',
    marginRight: 2,
  },
  totalLabel: {
    fontSize: 14,
    color: '#555',
    fontWeight: '500',
  },
  totalValue: {
    fontWeight: '700',
    color: '#333',
    fontSize: 14,
  },
  grandTotalRow: {
    borderTopWidth: 2,
    borderTopColor: '#748873',
    marginTop: 8,
    paddingTop: 10,
    borderBottomWidth: 0,
  },
  grandTotalLabel: {
    fontSize: 17,
    fontWeight: '800',
    color: '#748873',
  },
  grandTotalValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#748873',
  },
  btnContainer: {
    padding: 15,
    gap: 10,
    marginBottom: 30,
  },
  pdfBtn: {
    backgroundColor: '#D1A980',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  saveBtn: {
    backgroundColor: '#748873',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  recordsBtn: {
    backgroundColor: '#5A8F5A',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  btnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBox: {
    backgroundColor: '#FFF',
    padding: 20,
    borderRadius: 10,
    width: '80%',
    maxWidth: 300,
    borderWidth: 2,
    borderColor: '#D1A980',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 15,
    textAlign: 'center',
    color: '#748873',
  },
  modalOption: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E0D8',
  },
  modalOptionText: {
    fontSize: 16,
    textAlign: 'center',
    color: '#555',
  },
  modalCancelBtn: {
    backgroundColor: '#748873',
    padding: 12,
    borderRadius: 6,
    marginTop: 10,
  },
  modalCancelText: {
    color: '#FFF',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '700',
  },
});