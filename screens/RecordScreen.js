import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Alert,
  StyleSheet,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

export default function RecordScreen({ navigation }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecords();
    
    const unsubscribe = navigation.addListener('focus', () => {
      loadRecords();
    });

    return unsubscribe;
  }, [navigation]);

  const loadRecords = async () => {
    try {
      const saved = await AsyncStorage.getItem('cftRecords');
      const parsed = saved ? JSON.parse(saved) : [];
      setRecords(parsed);
    } catch (e) {
      Alert.alert('Error', 'Failed to load records');
      console.error('Load records error:', e);
    } finally {
      setLoading(false);
    }
  };

  const deleteRecord = async (id) => {
    Alert.alert(
      'Delete Record',
      'Are you sure you want to delete this record?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              const saved = await AsyncStorage.getItem('cftRecords');
              const parsed = saved ? JSON.parse(saved) : [];
              const updated = parsed.filter((r) => r.id !== id);
              await AsyncStorage.setItem('cftRecords', JSON.stringify(updated));
              setRecords(updated);
              Alert.alert('Success', 'Record deleted');
            } catch (e) {
              Alert.alert('Error', 'Failed to delete record');
              console.error('Delete error:', e);
            }
          },
        },
      ]
    );
  };

  const deleteAllRecords = () => {
    if (records.length === 0) {
      Alert.alert('No Records', 'There are no records to delete.');
      return;
    }

    Alert.alert(
      'Delete ALL Records',
      'Are you sure you want to delete ALL records? This cannot be undone!',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('cftRecords');
              setRecords([]);
              Alert.alert('Success', 'All records deleted');
            } catch (e) {
              Alert.alert('Error', 'Failed to delete records');
            }
          },
        },
      ]
    );
  };

  const viewRecord = (record) => {
    navigation.navigate('RecordDetails', { record });
  };

  const editRecord = (record) => {
    navigation.navigate('NewCalculation', { editRecord: record });
  };

  const getGrandTotal = (totals) => {
    if (!totals) return 0;
    return totals.grandTotal || totals.grand || 0;
  };

  const getBalanceDue = (totals) => {
    if (!totals) return null;
    return totals.balanceDue;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Saved Records ({records.length})</Text>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            onPress={() => navigation.navigate('NewCalculation')}
            style={styles.newButton}
          >
            <Text style={styles.newButtonText}>+ New</Text>
          </TouchableOpacity>
          {records.length > 0 && (
            <TouchableOpacity
              onPress={deleteAllRecords}
              style={styles.deleteAllButton}
            >
              <Text style={styles.deleteAllButtonText}>Delete All</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {records.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyTitle}>No records saved yet</Text>
          <Text style={styles.emptySubtitle}>
            Create a calculation and tap "Save Record" to see it here.
          </Text>
          <TouchableOpacity
            onPress={() => navigation.navigate('NewCalculation')}
            style={styles.createButton}
          >
            <Text style={styles.createButtonText}>Create First Record</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={records}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={true}
          renderItem={({ item }) => {
            const grandTotal = getGrandTotal(item.totals);
            const balanceDue = getBalanceDue(item.totals);
            const hasDiscount = item.discount && parseFloat(item.discount) > 0;
            const hasAdvance = item.advancePaid && parseFloat(item.advancePaid) > 0;

            // FIX: Smartly check for the customer's name regardless of what the variable is called
            const displayBuyerName = item.buyerName || item.BuyerName || item.soldToName || item.customerName || 'Unnamed Customer';

            return (
              <View style={styles.recordCard}>
                {/* Record Info */}
                <TouchableOpacity
                  onPress={() => viewRecord(item)}
                  style={styles.recordInfo}
                >
                  <Text style={styles.recordName}>
                    {displayBuyerName}
                  </Text>
                  <Text style={styles.recordMeta}>
                    Invoice: {item.invoiceNumber}  |  Date: {item.date}
                  </Text>

                  {item.soldByName ? (
                    <Text style={styles.recordMeta}>
                      Sold By: {item.soldByName}
                    </Text>
                  ) : null}

                  <Text style={styles.recordTotal}>
                    Grand Total: ₹{grandTotal.toFixed(2)}
                  </Text>

                  {hasDiscount ? (
                    <Text style={styles.recordDiscount}>
                      Discount: -₹{parseFloat(item.discount).toFixed(2)}
                    </Text>
                  ) : null}

                  {hasAdvance ? (
                    <Text style={styles.recordDiscount}>
                      Advance Paid: -₹{parseFloat(item.advancePaid).toFixed(2)}
                    </Text>
                  ) : null}

                  {(hasDiscount || hasAdvance) && balanceDue !== null ? (
                    <View style={styles.balanceBadge}>
                      <Text style={styles.balanceText}>
                        Balance Due: ₹{balanceDue.toFixed(2)}
                      </Text>
                    </View>
                  ) : null}
                </TouchableOpacity>

                {/* Action Buttons */}
                <View style={styles.actionColumn}>
                  <TouchableOpacity
                    onPress={() => viewRecord(item)}
                    style={styles.viewButton}
                  >
                    <Text style={styles.viewButtonText}>View</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => editRecord(item)}
                    style={styles.editButton}
                  >
                    <Text style={styles.editButtonText}>Edit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => deleteRecord(item.id)}
                    style={styles.deleteButton}
                  >
                    <Text style={styles.deleteButtonText}>Delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  loadingText: {
    fontSize: 18,
    color: '#748873',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#EEE',
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#748873',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  newButton: {
    backgroundColor: '#748873',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 6,
  },
  newButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  deleteAllButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 8,
    paddingHorizontal: 15,
    borderRadius: 6,
  },
  deleteAllButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 14,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 30,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#748873',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: '#666',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  createButton: {
    backgroundColor: '#748873',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  createButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  listContainer: {
    padding: 15,
    paddingBottom: 40,
  },
  recordCard: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderRadius: 10,
    marginBottom: 12,
    padding: 15,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  recordInfo: {
    flex: 1,
    marginRight: 10,
  },
  recordName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  recordMeta: {
    fontSize: 13,
    color: '#888',
    marginBottom: 3,
  },
  recordTotal: {
    fontSize: 15,
    fontWeight: '600',
    color: '#748873',
    marginTop: 6,
  },
  recordDiscount: {
    fontSize: 13,
    color: '#FF6B6B',
    marginTop: 2,
  },
  balanceBadge: {
    backgroundColor: '#748873',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 4,
    marginTop: 6,
    alignSelf: 'flex-start',
  },
  balanceText: {
    color: '#FFF',
    fontWeight: '700',
    fontSize: 14,
  },
  actionColumn: {
    justifyContent: 'center',
    gap: 6,
  },
  viewButton: {
    backgroundColor: '#748873',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  viewButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 12,
  },
  editButton: {
    backgroundColor: '#D1A980',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  editButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 12,
  },
  deleteButton: {
    backgroundColor: '#FF6B6B',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 4,
    alignItems: 'center',
  },
  deleteButtonText: {
    color: '#FFF',
    fontWeight: '600',
    fontSize: 12,
  },
});