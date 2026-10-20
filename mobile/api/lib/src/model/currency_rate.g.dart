// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'currency_rate.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$CurrencyRate extends CurrencyRate {
  @override
  final String code;
  @override
  final String? rate;

  factory _$CurrencyRate([void Function(CurrencyRateBuilder)? updates]) =>
      (CurrencyRateBuilder()..update(updates))._build();

  _$CurrencyRate._({required this.code, this.rate}) : super._();
  @override
  CurrencyRate rebuild(void Function(CurrencyRateBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  CurrencyRateBuilder toBuilder() => CurrencyRateBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is CurrencyRate && code == other.code && rate == other.rate;
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
    return (newBuiltValueToStringHelper(r'CurrencyRate')
          ..add('code', code)
          ..add('rate', rate))
        .toString();
  }
}

class CurrencyRateBuilder
    implements Builder<CurrencyRate, CurrencyRateBuilder> {
  _$CurrencyRate? _$v;

  String? _code;
  String? get code => _$this._code;
  set code(String? code) => _$this._code = code;

  String? _rate;
  String? get rate => _$this._rate;
  set rate(String? rate) => _$this._rate = rate;

  CurrencyRateBuilder() {
    CurrencyRate._defaults(this);
  }

  CurrencyRateBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _code = $v.code;
      _rate = $v.rate;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(CurrencyRate other) {
    _$v = other as _$CurrencyRate;
  }

  @override
  void update(void Function(CurrencyRateBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  CurrencyRate build() => _build();

  _$CurrencyRate _build() {
    final _$result = _$v ??
        _$CurrencyRate._(
          code: BuiltValueNullFieldError.checkNotNull(
              code, r'CurrencyRate', 'code'),
          rate: rate,
        );
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
