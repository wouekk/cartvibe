// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'exchange_rates.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$ExchangeRates extends ExchangeRates {
  @override
  final String? mainCurrency;
  @override
  final BuiltList<ExchangeRate> rates;

  factory _$ExchangeRates([void Function(ExchangeRatesBuilder)? updates]) =>
      (ExchangeRatesBuilder()..update(updates))._build();

  _$ExchangeRates._({this.mainCurrency, required this.rates}) : super._();
  @override
  ExchangeRates rebuild(void Function(ExchangeRatesBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  ExchangeRatesBuilder toBuilder() => ExchangeRatesBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is ExchangeRates &&
        mainCurrency == other.mainCurrency &&
        rates == other.rates;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, mainCurrency.hashCode);
    _$hash = $jc(_$hash, rates.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'ExchangeRates')
          ..add('mainCurrency', mainCurrency)
          ..add('rates', rates))
        .toString();
  }
}

class ExchangeRatesBuilder
    implements Builder<ExchangeRates, ExchangeRatesBuilder> {
  _$ExchangeRates? _$v;

  String? _mainCurrency;
  String? get mainCurrency => _$this._mainCurrency;
  set mainCurrency(String? mainCurrency) => _$this._mainCurrency = mainCurrency;

  ListBuilder<ExchangeRate>? _rates;
  ListBuilder<ExchangeRate> get rates =>
      _$this._rates ??= ListBuilder<ExchangeRate>();
  set rates(ListBuilder<ExchangeRate>? rates) => _$this._rates = rates;

  ExchangeRatesBuilder() {
    ExchangeRates._defaults(this);
  }

  ExchangeRatesBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _mainCurrency = $v.mainCurrency;
      _rates = $v.rates.toBuilder();
      _$v = null;
    }
    return this;
  }

  @override
  void replace(ExchangeRates other) {
    _$v = other as _$ExchangeRates;
  }

  @override
  void update(void Function(ExchangeRatesBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  ExchangeRates build() => _build();

  _$ExchangeRates _build() {
    _$ExchangeRates _$result;
    try {
      _$result = _$v ??
          _$ExchangeRates._(
            mainCurrency: mainCurrency,
            rates: rates.build(),
          );
    } catch (_) {
      late String _$failedField;
      try {
        _$failedField = 'rates';
        rates.build();
      } catch (e) {
        throw BuiltValueNestedFieldError(
            r'ExchangeRates', _$failedField, e.toString());
      }
      rethrow;
    }
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
