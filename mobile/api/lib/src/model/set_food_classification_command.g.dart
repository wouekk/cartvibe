// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'set_food_classification_command.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$SetFoodClassificationCommand extends SetFoodClassificationCommand {
  @override
  final String health;
  @override
  final String? seasonality;

  factory _$SetFoodClassificationCommand(
          [void Function(SetFoodClassificationCommandBuilder)? updates]) =>
      (SetFoodClassificationCommandBuilder()..update(updates))._build();

  _$SetFoodClassificationCommand._({required this.health, this.seasonality})
      : super._();
  @override
  SetFoodClassificationCommand rebuild(
          void Function(SetFoodClassificationCommandBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  SetFoodClassificationCommandBuilder toBuilder() =>
      SetFoodClassificationCommandBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is SetFoodClassificationCommand &&
        health == other.health &&
        seasonality == other.seasonality;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, health.hashCode);
    _$hash = $jc(_$hash, seasonality.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'SetFoodClassificationCommand')
          ..add('health', health)
          ..add('seasonality', seasonality))
        .toString();
  }
}

class SetFoodClassificationCommandBuilder
    implements
        Builder<SetFoodClassificationCommand,
            SetFoodClassificationCommandBuilder> {
  _$SetFoodClassificationCommand? _$v;

  String? _health;
  String? get health => _$this._health;
  set health(String? health) => _$this._health = health;

  String? _seasonality;
  String? get seasonality => _$this._seasonality;
  set seasonality(String? seasonality) => _$this._seasonality = seasonality;

  SetFoodClassificationCommandBuilder() {
    SetFoodClassificationCommand._defaults(this);
  }

  SetFoodClassificationCommandBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _health = $v.health;
      _seasonality = $v.seasonality;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(SetFoodClassificationCommand other) {
    _$v = other as _$SetFoodClassificationCommand;
  }

  @override
  void update(void Function(SetFoodClassificationCommandBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  SetFoodClassificationCommand build() => _build();

  _$SetFoodClassificationCommand _build() {
    final _$result = _$v ??
        _$SetFoodClassificationCommand._(
          health: BuiltValueNullFieldError.checkNotNull(
              health, r'SetFoodClassificationCommand', 'health'),
          seasonality: seasonality,
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
