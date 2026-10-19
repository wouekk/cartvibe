// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'receipt_products_view.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$ReceiptProductsView extends ReceiptProductsView {
  @override
  final String status;
  @override
  final String lastError;
  @override
  final BuiltList<ReceiptProduct> products;

  factory _$ReceiptProductsView(
          [void Function(ReceiptProductsViewBuilder)? updates]) =>
      (ReceiptProductsViewBuilder()..update(updates))._build();

  _$ReceiptProductsView._(
      {required this.status, required this.lastError, required this.products})
      : super._();
  @override
  ReceiptProductsView rebuild(
          void Function(ReceiptProductsViewBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  ReceiptProductsViewBuilder toBuilder() =>
      ReceiptProductsViewBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is ReceiptProductsView &&
        status == other.status &&
        lastError == other.lastError &&
        products == other.products;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, status.hashCode);
    _$hash = $jc(_$hash, lastError.hashCode);
    _$hash = $jc(_$hash, products.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'ReceiptProductsView')
          ..add('status', status)
          ..add('lastError', lastError)
          ..add('products', products))
        .toString();
  }
}

class ReceiptProductsViewBuilder
    implements Builder<ReceiptProductsView, ReceiptProductsViewBuilder> {
  _$ReceiptProductsView? _$v;

  String? _status;
  String? get status => _$this._status;
  set status(String? status) => _$this._status = status;

  String? _lastError;
  String? get lastError => _$this._lastError;
  set lastError(String? lastError) => _$this._lastError = lastError;

  ListBuilder<ReceiptProduct>? _products;
  ListBuilder<ReceiptProduct> get products =>
      _$this._products ??= ListBuilder<ReceiptProduct>();
  set products(ListBuilder<ReceiptProduct>? products) =>
      _$this._products = products;

  ReceiptProductsViewBuilder() {
    ReceiptProductsView._defaults(this);
  }

  ReceiptProductsViewBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _status = $v.status;
      _lastError = $v.lastError;
      _products = $v.products.toBuilder();
      _$v = null;
    }
    return this;
  }

  @override
  void replace(ReceiptProductsView other) {
    _$v = other as _$ReceiptProductsView;
  }

  @override
  void update(void Function(ReceiptProductsViewBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  ReceiptProductsView build() => _build();

  _$ReceiptProductsView _build() {
    _$ReceiptProductsView _$result;
    try {
      _$result = _$v ??
          _$ReceiptProductsView._(
            status: BuiltValueNullFieldError.checkNotNull(
                status, r'ReceiptProductsView', 'status'),
            lastError: BuiltValueNullFieldError.checkNotNull(
                lastError, r'ReceiptProductsView', 'lastError'),
            products: products.build(),
          );
    } catch (_) {
      late String _$failedField;
      try {
        _$failedField = 'products';
        products.build();
      } catch (e) {
        throw BuiltValueNestedFieldError(
            r'ReceiptProductsView', _$failedField, e.toString());
      }
      rethrow;
    }
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
