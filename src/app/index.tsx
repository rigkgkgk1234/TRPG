import { StyleSheet, Text, View } from 'react-native';

export default function TitleScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>버들여울</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: '600' },
});
