import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Alert,
  StyleSheet,
  Platform,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

const unitOptions = [
  { value: 'inches', label: 'In' },
  { value: 'feet', label: 'Ft' },
  { value: 'mm', label: 'Mm' },
  { value: 'soot', label: 'St' },
];

const convertToInches = (value, unit) => {
  if (value === '' || value === null || isNaN(Number(value))) return 0;
  const num = parseFloat(value);
  switch (unit) {
    case 'feet': return num * 12;
    case 'mm': return num / 25.4;
    case 'soot': return num / 8;
    default: return num;
  }
};

const calculateCFT = (l, w, h, lUnit, wUnit, hUnit) => {
  if (!l || !w || !h) return 0;
  const li = convertToInches(l, lUnit);
  const wi = convertToInches(w, wUnit);
  const hi = convertToInches(h, hUnit);
  return (li * wi * hi) / 1728;
};

const formatINR = (num) => {
  if (num === null || num === undefined || isNaN(num)) return '0.00';
  return Number(num).toFixed(2);
};

export default function RecordDetailScreen({ route, navigation }) {
  const { record } = route.params;

  // FIX: Smart check for customer name regardless of how it was saved
  const displayBuyerName = record.soldToName || record.BuyerName || record.buyerName || record.customerName || '-';

  const generatePDF = async () => {
    try {
      let rowsHTML = '';
      let rowNumber = 0;
      let grandTotalCFT = 0;
      let grandTotalAmount = 0;

      record.rows
        .filter(row => row.length && row.width && row.height)
        .forEach((row, i) => {
          rowNumber++;
          const cft = calculateCFT(
            row.length, row.width, row.height,
            row.lengthUnit, row.widthUnit, row.heightUnit
          );
          const qty = parseFloat(row.quantity) || 0;
          const rate = parseFloat(row.pricePerCft) || 0;
          const totalCft = cft * qty;
          const amount = totalCft * rate;
          
          grandTotalCFT += totalCft;
          grandTotalAmount += amount;

          // Dimension + Unit stacked for perfect width fitting
          const lUnit = unitOptions.find(u => u.value === row.lengthUnit)?.label || 'In';
          const wUnit = unitOptions.find(u => u.value === row.widthUnit)?.label || 'In';
          const hUnit = unitOptions.find(u => u.value === row.heightUnit)?.label || 'In';

          rowsHTML += `
            <tr>
              <td>${rowNumber}</td>
              <td style="text-align: left; padding-left: 4px;">${row.itemName || 'Item ' + rowNumber}</td>
              <td>${row.length}<br><span style="font-size: 8px; color: #555;">${lUnit}</span></td>
              <td>${row.width}<br><span style="font-size: 8px; color: #555;">${wUnit}</span></td>
              <td>${row.height}<br><span style="font-size: 8px; color: #555;">${hUnit}</span></td>
              <td>${cft.toFixed(4)}</td>
              <td>${qty}</td>
              <td style="font-weight: bold;">${totalCft.toFixed(4)}</td>
              <td style="text-align: right; padding-right: 4px;">${formatINR(rate)}</td>
              <td style="text-align: right; padding-right: 4px; font-weight: bold;">${formatINR(amount)}</td>
            </tr>`;
        });

      let chargesHtml = '';
      if (record.additionalCharges && record.additionalCharges.length > 0) {
        record.additionalCharges.forEach(charge => {
          if (parseFloat(charge.amount) > 0) {
            chargesHtml += `
              <tr>
                <td style="padding: 4px 0; border-bottom: 1px dashed #ccc;">${charge.label || 'Charge'} (${charge.type === 'minus' ? '-' : '+'})</td>
                <td style="padding: 4px 0; border-bottom: 1px dashed #ccc; text-align: right; font-weight: bold;">Rs. ${formatINR(parseFloat(charge.amount) || 0)}</td>
              </tr>`;
          }
        });
      }

      // Safe fallback for totals object to prevent crashes
      const t = record.totals || {
        totalCFT: grandTotalCFT,
        subtotal: grandTotalAmount,
        misc: 0,
        gstAmt: 0,
        grandTotal: grandTotalAmount,
        discountAmt: 0,
        advanceAmt: 0,
        balanceDue: grandTotalAmount
      };

      const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Invoice - ${displayBuyerName}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
  <style>
    @page { margin: 15px; size: A4 portrait; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; font-size: 11px; color: #000; background: #fff; padding: 15px; }
    
    table { width: 100%; border-collapse: collapse; }
    td, th { vertical-align: top; }
    
    .header-box { text-align: center; margin-bottom: 20px; border-bottom: 3px double #000; padding-bottom: 10px; }
    .header-title { font-size: 24px; font-weight: bold; letter-spacing: 1px; margin: 0; }
    
    .info-title { font-weight: bold; font-size: 11px; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 3px; margin-bottom: 5px; }
    
    .items-table { margin: 15px 0; }
    .items-table th { background-color: #333; color: #fff; border: 1px solid #000; padding: 6px 2px; text-align: center; font-size: 10px; text-transform: uppercase; }
    .items-table td { border: 1px solid #000; padding: 5px 2px; text-align: center; }
    .items-table tr:nth-child(even) td { background-color: #f9f9f9; }
    
    .totals-box { border: 1px solid #000; padding: 10px; }
    
    .footer-area { margin-top: 30px; border-top: 1px solid #000; padding-top: 20px; font-size: 10px; }
  </style>
</head>
<body>

  <div class="header-box">
    <h1 class="header-title">INVOICE</h1>
    <p style="margin-top: 4px; font-size: 10px; color: #444;">CFT Calculator Pro - Material Calculation Details</p>
  </div>

  <table style="margin-bottom: 15px;">
    <tr>
      <td style="width: 48%; border: 1px solid #000; padding: 10px;">
        <div class="info-title">Invoice Details</div>
        <table style="width: 100%;">
          <tr><td style="width: 80px; font-weight: bold; padding: 3px 0;">Date:</td><td style="padding: 3px 0;">${record.date}</td></tr>
          <tr><td style="width: 80px; font-weight: bold; padding: 3px 0;">Invoice #:</td><td style="padding: 3px 0;">${record.invoiceNumber}</td></tr>
        </table>
      </td>
      <td style="width: 4%;"></td>
      <td style="width: 48%; border: 1px solid #000; padding: 10px;">
        <div class="info-title">Party Details</div>
        <table style="width: 100%;">
          <tr><td style="width: 60px; font-weight: bold; padding: 3px 0;">Buyer:</td><td style="padding: 3px 0; font-weight: bold;">${displayBuyerName}</td></tr>
          <tr><td style="width: 60px; font-weight: bold; padding: 3px 0;">Seller:</td><td style="padding: 3px 0;">${record.soldByName || 'N/A'}</td></tr>
        </table>
      </td>
    </tr>
  </table>

  <div style="font-weight: bold; font-size: 12px; margin-bottom: 5px;">MATERIAL BREAKDOWN</div>
  <table class="items-table">
    <thead>
      <tr>
        <th style="width: 4%;">#</th>
        <th style="width: 22%; text-align: left; padding-left: 4px;">Item Name</th>
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
      ${rowsHTML || '<tr><td colspan="10" style="text-align:center; padding:20px;">No items added</td></tr>'}
      ${rowNumber > 0 ? `
      <tr style="background-color: #e0e0e0;">
        <td colspan="7" style="text-align: right; padding-right: 10px; font-weight: bold;">GRAND TOTAL</td>
        <td style="font-weight: bold;">${grandTotalCFT.toFixed(4)}</td>
        <td></td>
        <td style="text-align: right; padding-right: 4px; font-weight: bold;">Rs. ${formatINR(grandTotalAmount)}</td>
      </tr>` : ''}
    </tbody>
  </table>

  <table style="margin-top: 15px;">
    <tr>
      <td style="width: 48%;" class="totals-box">
        <div class="info-title">Calculation Summary</div>
        <table style="width: 100%;">
          <tr>
            <td style="padding: 4px 0; border-bottom: 1px dashed #ccc;">Total CFT:</td>
            <td style="padding: 4px 0; border-bottom: 1px dashed #ccc; text-align: right; font-weight: bold;">${t.totalCFT.toFixed(4)}</td>
          </tr>
          <tr>
            <td style="padding: 4px 0; border-bottom: 1px dashed #ccc;">Subtotal Amount:</td>
            <td style="padding: 4px 0; border-bottom: 1px dashed #ccc; text-align: right; font-weight: bold;">Rs. ${formatINR(t.subtotal)}</td>
          </tr>
          ${chargesHtml}
          ${record.gst > 0 ? `
          <tr>
            <td style="padding: 4px 0; border-bottom: 1px dashed #ccc;">GST (${record.gst}%):</td>
            <td style="padding: 4px 0; border-bottom: 1px dashed #ccc; text-align: right; font-weight: bold;">Rs. ${formatINR(t.gstAmt)}</td>
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
          ${t.discountAmt > 0 ? `
          <tr>
            <td style="padding: 4px 0; border-bottom: 1px dashed #ccc; color: #555;">Discount (-):</td>
            <td style="padding: 4px 0; border-bottom: 1px dashed #ccc; text-align: right; font-weight: bold;">Rs. ${formatINR(t.discountAmt)}</td>
          </tr>` : ''}
          ${t.advanceAmt > 0 ? `
          <tr>
            <td style="padding: 4px 0; border-bottom: 1px dashed #ccc; color: #555;">Advance Paid (-):</td>
            <td style="padding: 4px 0; border-bottom: 1px dashed #ccc; text-align: right; font-weight: bold;">Rs. ${formatINR(t.advanceAmt)}</td>
          </tr>` : ''}
          
          ${(t.discountAmt > 0 || t.advanceAmt > 0) ? `
          <tr>
            <td style="padding: 8px 0 0 0; font-weight: bold; font-size: 14px;">BALANCE DUE:</td>
            <td style="padding: 8px 0 0 0; text-align: right; font-weight: bold; font-size: 14px;">Rs. ${formatINR(t.balanceDue)}</td>
          </tr>` : `
          <tr>
            <td style="padding: 8px 0 0 0; font-weight: bold; font-size: 14px;">NET PAYABLE:</td>
            <td style="padding: 8px 0 0 0; text-align: right; font-weight: bold; font-size: 14px;">Rs. ${formatINR(t.grandTotal)}</td>
          </tr>`}
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

      // FIX: Clean filename with actual buyer's name
      const safeCustomerName = displayBuyerName.replace(/[^a-zA-Z0-9]/g, '_');
      const fileName = `Invoice_${safeCustomerName}_${record.invoiceNumber.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`;

      if (Platform.OS === 'web') {
        const link = document.createElement('a');
        link.href = uri;
        link.download = fileName;
        link.click();
        Alert.alert('Success', 'PDF Downloaded!');
        return;
      }

      const destinationPath = `${FileSystem.documentDirectory}${fileName}`;

      await FileSystem.copyAsync({
        from: uri,
        to: destinationPath,
      });

      Alert.alert(
        'PDF Saved!',
        'What would you like to do?',
        [
          { text: 'Done', style: 'cancel' },
          {
            text: 'Share PDF',
            onPress: async () => {
              if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(destinationPath);
              } else {
                Alert.alert('Error', 'Sharing not available');
              }
            },
          },
        ]
      );
    } catch (e) {
      Alert.alert('Error', 'Failed to generate PDF');
      console.error(e);
    }
  };

  const validRows = record.rows.filter(row => row.length && row.width && row.height);

  return (
    <View style={styles.container}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invoice Details</Text>
        <TouchableOpacity onPress={generatePDF} style={styles.pdfButton}>
          <Text style={styles.pdfButtonText}>PDF</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.content}
        nestedScrollEnabled={true}
        bounces={true}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.infoSection}>
          <Text style={styles.infoSectionTitle}>Invoice Information</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Invoice #:</Text>
            <Text style={styles.infoValue}>{record.invoiceNumber}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Date:</Text>
            <Text style={styles.infoValue}>{record.date}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Sold To:</Text>
            <Text style={styles.infoValue}>{displayBuyerName}</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Sold By:</Text>
            <Text style={styles.infoValue}>{record.soldByName || 'N/A'}</Text>
          </View>
          {record.gst > 0 && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>GST:</Text>
              <Text style={styles.infoValue}>{record.gst}%</Text>
            </View>
          )}
        </View>

        <View style={styles.itemsSection}>
          <Text style={styles.infoSectionTitle}>Items ({validRows.length})</Text>
          
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={true}
            nestedScrollEnabled={true}
            bounces={true}
            decelerationRate="fast"
            scrollEventThrottle={16}
          >
            <View>
              <View style={styles.tableHeader}>
                <Text style={[styles.tableHeaderCell, { width: 30 }]}>#</Text>
                <Text style={[styles.tableHeaderCell, { width: 100 }]}>Item</Text>
                <Text style={[styles.tableHeaderCell, { width: 80 }]}>L</Text>
                <Text style={[styles.tableHeaderCell, { width: 80 }]}>W</Text>
                <Text style={[styles.tableHeaderCell, { width: 80 }]}>H</Text>
                <Text style={[styles.tableHeaderCell, { width: 70 }]}>CFT</Text>
                <Text style={[styles.tableHeaderCell, { width: 50 }]}>Qty</Text>
                <Text style={[styles.tableHeaderCell, { width: 80 }]}>T.CFT</Text>
                <Text style={[styles.tableHeaderCell, { width: 80 }]}>Rate</Text>
                <Text style={[styles.tableHeaderCell, { width: 100 }]}>Amount</Text>
              </View>

              {validRows.map((row, i) => {
                const cft = calculateCFT(
                  row.length, row.width, row.height,
                  row.lengthUnit, row.widthUnit, row.heightUnit
                );
                const qty = parseFloat(row.quantity) || 0;
                const rate = parseFloat(row.pricePerCft) || 0;
                const totalCft = cft * qty;
                const amount = totalCft * rate;

                return (
                  <View key={i} style={[styles.tableRow, i % 2 === 0 ? styles.evenRow : null]}>
                    <Text style={[styles.tableCell, { width: 30 }]}>{i + 1}</Text>
                    <Text style={[styles.tableCell, { width: 100, textAlign: 'left' }]}>
                      {row.itemName || 'Item ' + (i + 1)}
                    </Text>
                    <Text style={[styles.tableCell, { width: 80 }]}>
                      {row.length} {unitOptions.find(u => u.value === row.lengthUnit)?.label || 'In'}
                    </Text>
                    <Text style={[styles.tableCell, { width: 80 }]}>
                      {row.width} {unitOptions.find(u => u.value === row.widthUnit)?.label || 'In'}
                    </Text>
                    <Text style={[styles.tableCell, { width: 80 }]}>
                      {row.height} {unitOptions.find(u => u.value === row.heightUnit)?.label || 'In'}
                    </Text>
                    <Text style={[styles.tableCell, { width: 70 }]}>{cft.toFixed(3)}</Text>
                    <Text style={[styles.tableCell, { width: 50 }]}>{qty}</Text>
                    <Text style={[styles.tableCell, { width: 80 }]}>{totalCft.toFixed(3)}</Text>
                    <Text style={[styles.tableCell, { width: 80 }]}>₹{formatINR(rate)}</Text>
                    <Text style={[styles.tableCell, { width: 100, fontWeight: '600', color: '#748873' }]}>
                      ₹{formatINR(amount)}
                    </Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>

        {record.additionalCharges && record.additionalCharges.length > 0 && (
          <View style={styles.chargesSection}>
            <Text style={styles.infoSectionTitle}>Additional Charges</Text>
            {record.additionalCharges
              .filter(ch => ch.label || parseFloat(ch.amount) > 0)
              .map((charge, index) => (
                <View key={index} style={styles.chargeItem}>
                  <Text style={styles.chargeLabel}>{charge.label || 'Charge'}</Text>
                  <Text style={styles.chargeAmount}>₹{formatINR(parseFloat(charge.amount) || 0)}</Text>
                </View>
              ))
            }
          </View>
        )}

        <View style={styles.totalsSection}>
          <Text style={styles.infoSectionTitle}>Invoice Totals</Text>
          
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total CFT:</Text>
            <Text style={styles.totalValue}>{record.totals?.totalCFT?.toFixed(4) || '0.0000'}</Text>
          </View>
          
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Subtotal:</Text>
            <Text style={styles.totalValue}>₹{formatINR(record.totals?.subtotal)}</Text>
          </View>

          {record.totals?.misc > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>Additional Charges:</Text>
              <Text style={styles.totalValue}>₹{formatINR(record.totals?.misc)}</Text>
            </View>
          )}

          {record.gst > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.totalLabel}>GST ({record.gst}%):</Text>
              <Text style={styles.totalValue}>₹{formatINR(record.totals?.gstAmt)}</Text>
            </View>
          )}

          <View style={[styles.totalRow, styles.grandTotalRow]}>
            <Text style={styles.grandTotalLabel}>Grand Total:</Text>
            <Text style={styles.grandTotalValue}>₹{formatINR(record.totals?.grandTotal)}</Text>
          </View>

          {record.totals?.discountAmt > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.deductionLabel}>Discount (-):</Text>
              <Text style={styles.deductionValue}>₹{formatINR(record.totals?.discountAmt)}</Text>
            </View>
          )}

          {record.totals?.advanceAmt > 0 && (
            <View style={styles.totalRow}>
              <Text style={styles.deductionLabel}>Advance Paid (-):</Text>
              <Text style={styles.deductionValue}>₹{formatINR(record.totals?.advanceAmt)}</Text>
            </View>
          )}

          {(record.totals?.discountAmt > 0 || record.totals?.advanceAmt > 0) && (
            <View style={styles.balanceRow}>
              <Text style={styles.balanceLabel}>BALANCE DUE:</Text>
              <Text style={styles.balanceValue}>₹{formatINR(record.totals?.balanceDue)}</Text>
            </View>
          )}
        </View>

        <View style={styles.buttonContainer}>
          <TouchableOpacity onPress={generatePDF} style={styles.generatePdfButton}>
            <Text style={styles.buttonText}>Generate PDF</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => navigation.navigate('NewCalculation', { editRecord: record })}
            style={styles.editButton}
          >
            <Text style={styles.buttonText}>Edit Record</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.goBackButton}>
            <Text style={styles.buttonText}>← Back to Records</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F0',
  },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E0D8',
  },
  backButton: {
    padding: 8,
  },
  backText: {
    fontSize: 16,
    color: '#748873',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#748873',
  },
  pdfButton: {
    backgroundColor: '#D1A980',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 6,
  },
  pdfButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  content: {
    flex: 1,
  },
  infoSection: {
    backgroundColor: '#FFFFFF',
    margin: 10,
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E0D8',
  },
  infoSectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#748873',
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EBE3',
  },
  infoLabel: {
    fontWeight: '600',
    width: 100,
    color: '#555',
    fontSize: 14,
  },
  infoValue: {
    flex: 1,
    fontSize: 16,
    color: '#333',
  },
  itemsSection: {
    backgroundColor: '#FFFFFF',
    margin: 10,
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E0D8',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#748873',
    paddingVertical: 10,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  tableHeaderCell: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E0D8',
    paddingVertical: 8,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  evenRow: {
    backgroundColor: '#FAFAF5',
  },
  tableCell: {
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 4,
    color: '#555',
  },
  chargesSection: {
    backgroundColor: '#FFFFFF',
    margin: 10,
    padding: 15,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E0D8',
  },
  chargeItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EBE3',
  },
  chargeLabel: {
    fontSize: 14,
    color: '#555',
  },
  chargeAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#748873',
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
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F0EBE3',
  },
  totalLabel: {
    fontSize: 14,
    color: '#555',
  },
  totalValue: {
    fontWeight: '600',
    color: '#748873',
    fontSize: 14,
  },
  grandTotalRow: {
    borderTopWidth: 2,
    borderTopColor: '#D1A980',
    marginTop: 8,
    paddingTop: 10,
    borderBottomWidth: 0,
  },
  grandTotalLabel: {
    fontSize: 17,
    fontWeight: '700',
    color: '#748873',
  },
  grandTotalValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#748873',
  },
  deductionLabel: {
    color: '#B0855A',
    fontWeight: '600',
    fontSize: 14,
  },
  deductionValue: {
    color: '#B0855A',
    fontWeight: '600',
    fontSize: 14,
  },
  balanceRow: {
    backgroundColor: '#748873',
    padding: 12,
    borderRadius: 6,
    marginTop: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  balanceLabel: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  balanceValue: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonContainer: {
    padding: 15,
    gap: 10,
    marginBottom: 30,
  },
  generatePdfButton: {
    backgroundColor: '#D1A980',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  editButton: {
    backgroundColor: '#748873',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  goBackButton: {
    backgroundColor: '#5A8F5A',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});