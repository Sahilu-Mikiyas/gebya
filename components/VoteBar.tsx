/**
 * VoteBar — Phase 11-B
 * Community voting UI for price log rows.
 *
 * Shows:
 *   👍 Helpful  [count]  ████░░░  🚩 Flag  [count]
 *   A thin progress bar between them showing the helpful ratio.
 *
 * Optimistic updates are handled by the parent via `onVote`.
 *
 * Usage:
 *   <VoteBar
 *     logId={log.id}
 *     helpfulVotes={log.helpful_votes}
 *     flagCount={log.flag_count}
 *     userVote={myVote}
 *     onVote={(type) => voteMutation.mutate({ logId: log.id, voteType: type })}
 *   />
 */
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '@/constants/colors';

export type VoteType = 'helpful' | 'flag';

interface Props {
  logId:        string;
  helpfulVotes: number;
  flagCount:    number;
  userVote:     VoteType | null;
  onVote:       (type: VoteType) => void;
  disabled?:    boolean;
}

export default function VoteBar({
  helpfulVotes,
  flagCount,
  userVote,
  onVote,
  disabled = false,
}: Props) {
  const total   = helpfulVotes + flagCount;
  const ratio   = total > 0 ? helpfulVotes / total : 0.5;
  const barFill = Math.max(0.04, Math.min(0.96, ratio));  // clamp for visual min width

  const isHelpful = userVote === 'helpful';
  const isFlag    = userVote === 'flag';

  return (
    <View style={styles.wrap}>
      {/* 👍 Helpful button */}
      <TouchableOpacity
        style={[
          styles.pill,
          styles.helpfulPill,
          isHelpful && styles.helpfulActive,
        ]}
        onPress={() => onVote('helpful')}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Text style={styles.pillEmoji}>👍</Text>
        <Text style={[styles.pillCount, isHelpful && { color: Colors.veggie }]}>
          {helpfulVotes}
        </Text>
      </TouchableOpacity>

      {/* Progress bar */}
      <View style={styles.bar}>
        <View
          style={[
            styles.barFill,
            { flex: barFill },
            total === 0 && { backgroundColor: Colors.t6 },
          ]}
        />
        <View style={[styles.barRest, { flex: 1 - barFill }]} />
      </View>

      {/* 🚩 Flag button */}
      <TouchableOpacity
        style={[
          styles.pill,
          styles.flagPill,
          isFlag && styles.flagActive,
        ]}
        onPress={() => onVote('flag')}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <Text style={[styles.pillCount, isFlag && { color: Colors.flagged }]}>
          {flagCount}
        </Text>
        <Text style={styles.pillEmoji}>🚩</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           6,
    marginTop:     8,
  },

  // Pills
  pill: {
    flexDirection:   'row',
    alignItems:      'center',
    gap:             4,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius:    100,
    borderWidth:     1,
    backgroundColor: 'transparent',
  },
  helpfulPill: {
    borderColor: Colors.veggie + '30',
  },
  helpfulActive: {
    backgroundColor: Colors.veggie + '18',
    borderColor:     Colors.veggie + '60',
  },
  flagPill: {
    borderColor: Colors.flagged + '30',
  },
  flagActive: {
    backgroundColor: Colors.flagged + '18',
    borderColor:     Colors.flagged + '60',
  },

  pillEmoji: { fontSize: 11 },
  pillCount: { fontSize: 11, fontWeight: '800', color: Colors.t5 },

  // Bar
  bar: {
    flex:          1,
    height:        4,
    borderRadius:  2,
    overflow:      'hidden',
    flexDirection: 'row',
  },
  barFill: {
    backgroundColor: Colors.veggie + '60',
    borderRadius:    2,
  },
  barRest: {
    backgroundColor: Colors.flagged + '40',
    borderRadius:    2,
  },
});
