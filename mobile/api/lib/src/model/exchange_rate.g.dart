// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'exchange_rate.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$ExchangeRate extends ExchangeRate {
  @override
  final String code;
  @override
  final String? rate;

  factory _$ExchangeRate([void Function(ExchangeRateBuilder)? updates]) =>
      (ExchangeRateBuilder()..update(updates))._build();

  _$ExchangeRate._({required this.code, this.rate}) : super._();
  @override
  ExchangeRate rebuild(void Function(ExchangeRateBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  ExchangeRateBuilder toBuilder() => ExchangeRateBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is ExchangeRate && code == other.code && rate == other.rate;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, code.hashCode);
    _$hash = $jc(_$hash, rate.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'ExchangeRate')
          ..add('code', code)
          ..add('rate', rate))
        .toString();
  }
}

class ExchangeRateBuilder
    implements Builder<ExchangeRate, ExchangeRateBuilder> {
  _$ExchangeRate? _$v;

  String? _code;
  String? get code => _$this._code;
  set code(String? code) => _$this._code = code;

  String? _rate;
  String? get rate => _$this._rate;
  set rate(String? rate) => _$this._rate = rate;

  ExchangeRateBuilder() {
    ExchangeRate._defaults(this);
  }

  ExchangeRateBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _code = $v.code;
      _rate = $v.rate;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(ExchangeRate other) {
    _$v = other as _$ExchangeRate;
  }

  @override
  void update(void Function(ExchangeRateBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  ExchangeRate build() => _build();

  _$ExchangeRate _build() {
    final _$result = _$v ??
        _$ExchangeRate._(
          code: BuiltValueNullFieldError.checkNotNull(
              code, r'ExchangeRate', 'code'),
          rate: rate,
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
