// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'gemini_models_command.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$GeminiModelsCommand extends GeminiModelsCommand {
  @override
  final String? key;
  @override
  final int? receiptProcessingSettingsId;

  factory _$GeminiModelsCommand(
          [void Function(GeminiModelsCommandBuilder)? updates]) =>
      (GeminiModelsCommandBuilder()..update(updates))._build();

  _$GeminiModelsCommand._({this.key, this.receiptProcessingSettingsId})
      : super._();
  @override
  GeminiModelsCommand rebuild(
          void Function(GeminiModelsCommandBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  GeminiModelsCommandBuilder toBuilder() =>
      GeminiModelsCommandBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is GeminiModelsCommand &&
        key == other.key &&
        receiptProcessingSettingsId == other.receiptProcessingSettingsId;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, key.hashCode);
    _$hash = $jc(_$hash, receiptProcessingSettingsId.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'GeminiModelsCommand')
          ..add('key', key)
          ..add('receiptProcessingSettingsId', receiptProcessingSettingsId))
        .toString();
  }
}

class GeminiModelsCommandBuilder
    implements Builder<GeminiModelsCommand, GeminiModelsCommandBuilder> {
  _$GeminiModelsCommand? _$v;

  String? _key;
  String? get key => _$this._key;
  set key(String? key) => _$this._key = key;

  int? _receiptProcessingSettingsId;
  int? get receiptProcessingSettingsId => _$this._receiptProcessingSettingsId;
  set receiptProcessingSettingsId(int? receiptProcessingSettingsId) =>
      _$this._receiptProcessingSettingsId = receiptProcessingSettingsId;

  GeminiModelsCommandBuilder() {
    GeminiModelsCommand._defaults(this);
  }

  GeminiModelsCommandBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _key = $v.key;
      _receiptProcessingSettingsId = $v.receiptProcessingSettingsId;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(GeminiModelsCommand other) {
    _$v = other as _$GeminiModelsCommand;
  }

  @override
  void update(void Function(GeminiModelsCommandBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  GeminiModelsCommand build() => _build();

  _$GeminiModelsCommand _build() {
    final _$result = _$v ??
        _$GeminiModelsCommand._(
          key: key,
          receiptProcessingSettingsId: receiptProcessingSettingsId,
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
