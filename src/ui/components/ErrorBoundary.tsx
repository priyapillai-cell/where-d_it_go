import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '@/i18n';
import { logger } from '@/utils/logger';

import { AppText } from './AppText';
import { Button } from './Button';
import { Icon } from './Icon';

interface Props {
  children: ReactNode;
  /** Changing this value resets the boundary (e.g. on navigation). */
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    logger.error('Render error', { message: error.message, stack: info.componentStack });
  }

  override componentDidUpdate(prev: Props): void {
    if (prev.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null });
  }

  private reset = () => this.setState({ error: null });

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <View style={styles.container} accessibilityRole="alert">
        <Icon name="alert-circle-outline" size={48} color="#C62828" />
        <AppText variant="title" align="center">
          {t('common.somethingWentWrong')}
        </AppText>
        <AppText variant="body" color="textSecondary" align="center">
          {t('common.errorDetails')}
        </AppText>
        <Button label={t('app.retry')} onPress={this.reset} />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
});
