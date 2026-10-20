// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'shopping_trip_view.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$ShoppingTripView extends ShoppingTripView {
  @override
  final int id;
  @override
  final int shoppingListId;
  @override
  final DateTime createdAt;
  @override
  final String status;
  @override
  final String lastError;
  @override
  final bool waitingForPhoto;
  @override
  final ShoppingTripReceipt? receipt;
  @override
  final int plannedItemCount;
  @override
  final int productCount;
  @override
  final String? unplannedAmount;
  @override
  final BuiltList<String> unplannedProducts;

  factory _$ShoppingTripView(
          [void Function(ShoppingTripViewBuilder)? updates]) =>
      (ShoppingTripViewBuilder()..update(updates))._build();

  _$ShoppingTripView._(
      {required this.id,
      required this.shoppingListId,
      required this.createdAt,
      required this.status,
      required this.lastError,
      required this.waitingForPhoto,
      this.receipt,
      required this.plannedItemCount,
      required this.productCount,
      this.unplannedAmount,
      required this.unplannedProducts})
      : super._();
  @override
  ShoppingTripView rebuild(void Function(ShoppingTripViewBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  ShoppingTripViewBuilder toBuilder() =>
      ShoppingTripViewBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is ShoppingTripView &&
        id == other.id &&
        shoppingListId == other.shoppingListId &&
        createdAt == other.createdAt &&
        status == other.status &&
        lastError == other.lastError &&
        waitingForPhoto == other.waitingForPhoto &&
        receipt == other.receipt &&
        plannedItemCount == other.plannedItemCount &&
        productCount == other.productCount &&
        unplannedAmount == other.unplannedAmount &&
        unplannedProducts == other.unplannedProducts;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, id.hashCode);
    _$hash = $jc(_$hash, shoppingListId.hashCode);
    _$hash = $jc(_$hash, createdAt.hashCode);
    _$hash = $jc(_$hash, status.hashCode);
    _$hash = $jc(_$hash, lastError.hashCode);
    _$hash = $jc(_$hash, waitingForPhoto.hashCode);
    _$hash = $jc(_$hash, receipt.hashCode);
    _$hash = $jc(_$hash, plannedItemCount.hashCode);
    _$hash = $jc(_$hash, productCount.hashCode);
    _$hash = $jc(_$hash, unplannedAmount.hashCode);
    _$hash = $jc(_$hash, unplannedProducts.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'ShoppingTripView')
          ..add('id', id)
          ..add('shoppingListId', shoppingListId)
          ..add('createdAt', createdAt)
          ..add('status', status)
          ..add('lastError', lastError)
          ..add('waitingForPhoto', waitingForPhoto)
          ..add('receipt', receipt)
          ..add('plannedItemCount', plannedItemCount)
          ..add('productCount', productCount)
          ..add('unplannedAmount', unplannedAmount)
          ..add('unplannedProducts', unplannedProducts))
        .toString();
  }
}

class ShoppingTripViewBuilder
    implements Builder<ShoppingTripView, ShoppingTripViewBuilder> {
  _$ShoppingTripView? _$v;

  int? _id;
  int? get id => _$this._id;
  set id(int? id) => _$this._id = id;

  int? _shoppingListId;
  int? get shoppingListId => _$this._shoppingListId;
  set shoppingListId(int? shoppingListId) =>
      _$this._shoppingListId = shoppingListId;

  DateTime? _createdAt;
  DateTime? get createdAt => _$this._createdAt;
  set createdAt(DateTime? createdAt) => _$this._createdAt = createdAt;

  String? _status;
  String? get status => _$this._status;
  set status(String? status) => _$this._status = status;

  String? _lastError;
  String? get lastError => _$this._lastError;
  set lastError(String? lastError) => _$this._lastError = lastError;

  bool? _waitingForPhoto;
  bool? get waitingForPhoto => _$this._waitingForPhoto;
  set waitingForPhoto(bool? waitingForPhoto) =>
      _$this._waitingForPhoto = waitingForPhoto;

  ShoppingTripReceiptBuilder? _receipt;
  ShoppingTripReceiptBuilder get receipt =>
      _$this._receipt ??= ShoppingTripReceiptBuilder();
  set receipt(ShoppingTripReceiptBuilder? receipt) => _$this._receipt = receipt;

  int? _plannedItemCount;
  int? get plannedItemCount => _$this._plannedItemCount;
  set plannedItemCount(int? plannedItemCount) =>
      _$this._plannedItemCount = plannedItemCount;

  int? _productCount;
  int? get productCount => _$this._productCount;
  set productCount(int? productCount) => _$this._productCount = productCount;

  String? _unplannedAmount;
  String? get unplannedAmount => _$this._unplannedAmount;
  set unplannedAmount(String? unplannedAmount) =>
      _$this._unplannedAmount = unplannedAmount;

  ListBuilder<String>? _unplannedProducts;
  ListBuilder<String> get unplannedProducts =>
      _$this._unplannedProducts ??= ListBuilder<String>();
  set unplannedProducts(ListBuilder<String>? unplannedProducts) =>
      _$this._unplannedProducts = unplannedProducts;

  ShoppingTripViewBuilder() {
    ShoppingTripView._defaults(this);
  }

  ShoppingTripViewBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _id = $v.id;
      _shoppingListId = $v.shoppingListId;
      _createdAt = $v.createdAt;
      _status = $v.status;
      _lastError = $v.lastError;
      _waitingForPhoto = $v.waitingForPhoto;
      _receipt = $v.receipt?.toBuilder();
      _plannedItemCount = $v.plannedItemCount;
      _productCount = $v.productCount;
      _unplannedAmount = $v.unplannedAmount;
      _unplannedProducts = $v.unplannedProducts.toBuilder();
      _$v = null;
    }
    return this;
  }

  @override
  void replace(ShoppingTripView other) {
    _$v = other as _$ShoppingTripView;
  }

  @override
  void update(void Function(ShoppingTripViewBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  ShoppingTripView build() => _build();

  _$ShoppingTripView _build() {
    _$ShoppingTripView _$result;
    try {
      _$result = _$v ??
          _$ShoppingTripView._(
            id: BuiltValueNullFieldError.checkNotNull(
                id, r'ShoppingTripView', 'id'),
            shoppingListId: BuiltValueNullFieldError.checkNotNull(
                shoppingListId, r'ShoppingTripView', 'shoppingListId'),
            createdAt: BuiltValueNullFieldError.checkNotNull(
                createdAt, r'ShoppingTripView', 'createdAt'),
            status: BuiltValueNullFieldError.checkNotNull(
                status, r'ShoppingTripView', 'status'),
            lastError: BuiltValueNullFieldError.checkNotNull(
                lastError, r'ShoppingTripView', 'lastError'),
            waitingForPhoto: BuiltValueNullFieldError.checkNotNull(
                waitingForPhoto, r'ShoppingTripView', 'waitingForPhoto'),
            receipt: _receipt?.build(),
            plannedItemCount: BuiltValueNullFieldError.checkNotNull(
                plannedItemCount, r'ShoppingTripView', 'plannedItemCount'),
            productCount: BuiltValueNullFieldError.checkNotNull(
                productCount, r'ShoppingTripView', 'productCount'),
            unplannedAmount: unplannedAmount,
            unplannedProducts: unplannedProducts.build(),
          );
    } catch (_) {
      late String _$failedField;
      try {
        _$failedField = 'receipt';
        _receipt?.build();

        _$failedField = 'unplannedProducts';
        unplannedProducts.build();
      } catch (e) {
        throw BuiltValueNestedFieldError(
            r'ShoppingTripView', _$failedField, e.toString());
      }
      rethrow;
    }
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
