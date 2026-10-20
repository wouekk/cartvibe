// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'currency_rate_table.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$CurrencyRateTable extends CurrencyRateTable {
  @override
  final String? mainCurrency;
  @override
  final BuiltList<CurrencyRate> rates;

  factory _$CurrencyRateTable(
          [void Function(CurrencyRateTableBuilder)? updates]) =>
      (CurrencyRateTableBuilder()..update(updates))._build();

  _$CurrencyRateTable._({this.mainCurrency, required this.rates}) : super._();
  @override
  CurrencyRateTable rebuild(void Function(CurrencyRateTableBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  CurrencyRateTableBuilder toBuilder() =>
      CurrencyRateTableBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is CurrencyRateTable &&
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
    return (newBuiltValueToStringHelper(r'CurrencyRateTable')
          ..add('mainCurrency', mainCurrency)
          ..add('rates', rates))
        .toString();
  }
}

class CurrencyRateTableBuilder
    implements Builder<CurrencyRateTable, CurrencyRateTableBuilder> {
  _$CurrencyRateTable? _$v;

  String? _mainCurrency;
  String? get mainCurrency => _$this._mainCurrency;
  set mainCurrency(String? mainCurrency) => _$this._mainCurrency = mainCurrency;

  ListBuilder<CurrencyRate>? _rates;
  ListBuilder<CurrencyRate> get rates =>
      _$this._rates ??= ListBuilder<CurrencyRate>();
  set rates(ListBuilder<CurrencyRate>? rates) => _$this._rates = rates;

  CurrencyRateTableBuilder() {
    CurrencyRateTable._defaults(this);
  }

  CurrencyRateTableBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _mainCurrency = $v.mainCurrency;
      _rates = $v.rates.toBuilder();
      _$v = null;
    }
    return this;
  }

  @override
  void replace(CurrencyRateTable other) {
    _$v = other as _$CurrencyRateTable;
  }

  @override
  void update(void Function(CurrencyRateTableBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  CurrencyRateTable build() => _build();

  _$CurrencyRateTable _build() {
    _$CurrencyRateTable _$result;
    try {
      _$result = _$v ??
          _$CurrencyRateTable._(
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
            r'CurrencyRateTable', _$failedField, e.toString());
      }
      rethrow;
    }
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
