/**
 * StorePriceBarChart — Phase 6
 * Bar chart showing average price per store for one item.
 * Uses react-native-gifted-charts BarChart.
 */
import { View, Text, StyleSheet } from 'react-native';
import { BarChart } from 'react-native-gifted-charts';
import { Colors } from '@/constants/colors';

export interface StoreBarData {
  store:      string;
  price:      number;
  isCheapest: boolean;
}

interface Props {
  data:     StoreBarData[];
  unit:     string;
  catColor: string;
}

export default function StorePriceBarChart({ data, unit, catColor }: Props) {
  if (!data.length) return null;

  const maxPrice = Math.max(...data.map((d) => d.price)) * 1.25;

  const barData = data.map((d) => ({
    value:         d.price,
    label:         d.store.length > 8 ? d.store.slice(0, 7) + '…' : d.store,
    frontColor:    d.isCheapest ? Colors.veggie : Colors.s4,
    topLabelComponent: () => (
      <Text style={[styles.topLabel, { color: d.isCheapest ? Colors.veggie : Colors.t5 }]}>
        {d.price.toFixed(0)}
      </Text>
    ),
  }));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Avg Price by Store</Text>
        <Text style={styles.subtitle}>ETB per {unit}</Text>
      </View>

      <BarChart
        data={barData}
        maxValue={maxPrice}
        barWidth={38}
        spacing={10}
        roundedTop
        roundedBottom
        hideRules
        hideYAxisText
        xAxisColor={Colors.border}
        xAxisLabelTextStyle={styles.xLabel}
        noOfSections={3}
        barBorderRadius={5}
        isAnimated
        animationDuration={600}
        width={320}
        height={100}
        backgroundColor="transparent"
        yAxisExtraHeight={20}
        leftShiftForLastIndexTooltip={30}
      />

      {/* Legend */}
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.veggie }]} />
          <Text style={styles.legendText}>Cheapest</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: Colors.s4 }]} />
          <Text style={styles.legendText}>Other stores</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: Colors.s1,
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     Colors.border,
    padding:         16,
    marginBottom:    10,
    overflow:        'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent:'space-between',
    alignItems:    'center',
    marginBottom:  16,
  },
  title:    { fontSize: 13, fontWeight: '800', color: Colors.t2 },
  subtitle: { fontSize: 11, color: Colors.t5 },
  topLabel: { fontSize: 10, fontWeight: '700', marginBottom: 4 },
  xLabel:   { fontSize: 9, color: Colors.t5 },
  legend:   { flexDirection: 'row', gap: 14, marginTop: 10 },
  legendItem:{ flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText:{ fontSize: 10, color: Colors.t5 },
});
