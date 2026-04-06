import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import NewCalculationScreen from './screens/NewCalculationScreen';
import RecordScreen from './screens/RecordScreen';
import RecordDetailScreen from './screens/RecordDetailScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="NewCalculation"
        screenOptions={{
          headerStyle: {
            backgroundColor: '#748873',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen
          name="NewCalculation"
          component={NewCalculationScreen}
          options={{
            title: '📊 CFT Calculator',
          }}
        />
        <Stack.Screen
          name="Records"
          component={RecordScreen}
          options={{
            title: '📁 Saved Records',
          }}
        />
        <Stack.Screen
          name="RecordDetails"
          component={RecordDetailScreen}
          options={{
            title: '📄 Invoice Details',
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}