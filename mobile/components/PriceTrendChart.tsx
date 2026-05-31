/**
 * PriceTrendChart — Phase 6
 * 4-week line chart with area fill showing price trend for an item.
 * Uses react-native-gifted-charts LineChart.
 */
import { View, Text, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-gifted-charts';
import { Colors } from '@/constants/colors';

export interface WeekPoint {
  week_start: string;   // ISO date
  avg_price:  number;
}

interface Props {
  data:     WeekPoint[];
  unit:     string;
  catColor: string;
}

function trendLabel(data: WeekPoint[]): { label: string; color: string; emoji: string } {
  if (data.length < 2) return { label: 'Not enough data', color: Colors.t5, emoji: '—' };
  const first = data[0].avg_price;
  const last  = data[data.length - 1].avg_price;
  const pct   = ((last - first) / first) * 100;
  if (pct > 5)  return { label: `↑ Rising +${pct.toFixed(0)}%`, color: Colors.flagged, emoji: '📈' };
  if (pct < -5) return { label: `↓ Falling ${pct.toFixed(0)}%`, color: Colors.veggie, emoji: '📉' };
  return           { label: '→ Stable', color: Colors.deal, emoji: '📊' };
}

function weekLabel(iso: string): string {
  const d = new Date(iso);
  return `Wk ${d.getDate()}/${d.getMonth() + 1}`;
}

export default function PriceTrendChart({ data, unit, catColor }: Props) {
  if (!data.length) return null;

  const trend = trendLabel(data);
  const maxV  = Math.max(...data.map((d) => d.avg_price)) * 1.2;
  const minV  = Math.max(0, Math.min(...data.map((d) => d.avg_price)) * 0.85);

  const lineData = data.map((d, i) => ({
    value:       d.avg_price,
    label:       weekLabel(d.week_start),
    dataPointText: i === data.length - 1 ? `${d.avg_price.toFixed(0)}` : undefined,
  }));

  const isRising = trend.emoji === '📈';
  const lineColor = isRising ? Colors.flagged : Colors.veggie;
  const areaColor = lineColor + '20';

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>4-Week Trend</Text>
        <View style={[styles.trendBadge, { backgroundColor: trend.color + '20', borderColor: trend.color + '50' }]}>
          <Text style={[styles.trendText, { color: trend.color }]}>{trend.label}</Text>
        </View>
      </View>

      {/* Chart */}
      <LineChart
        data={lineData}
        maxValue={maxV}
        color={lineColor}
        thickness={2.5}
        dataPointsColor={lineColor}
        dataPointsRadius={5}
        startFillColor={areaColor}
        endFillColor="transparent"
        areaChart
        curved
        hideRules
        hideYAxisText
        xAxisColor={Colors.border}
        xAxisLabelTextStyle={styles.xLabel}
        isAnimated
        animationDuration={800}
        width={310}
        height={90}
        backgroundColor="transparent"
        yAxisExtraHeight={20}
      />

      {/* Insight text */}
      {data.length >= 2 && (
        <Text style={styles.insight}>
          {trend.emoji}{' '}
          {data.length >= 2
            ? `Avg went from ${data[0].avg_price.toFixed(0)} → ${data[data.length-1].avg_price.toFixed(0)} ETB/${unit} over ${data.length} weeks`
            : ''}
          {isRising ? ' — consider buying sooner.' : '.'}
        </Text>
      )}
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
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   14,
  },
  title:      { fontSize: 13, fontWeight: '800', color: Colors.t2 },
  trendBadge: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 100, borderWidth: 1 },
  trendText:  { fontSize: 10, fontWeight: '800' },
  xLabel:     { fontSize: 9, color: Colors.t5 },
  insight:    { fontSize: 11, color: Colors.t4, marginTop: 10, lineHeight: 16 },
});
