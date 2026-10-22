export interface InputErrorMessage {
  error: string;
  /** The English text with its values filled in (what a custom validator or `additionalErrorMessages` produced). */
  message: string;
  /** The translation key to show: the English text with `{placeholders}`. */
  key: string;
  /** Values for the key's placeholders, without `label`, which the component translates when it renders. */
  params: Record<string, string | number>;
}
