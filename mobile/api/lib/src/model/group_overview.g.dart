// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'group_overview.dart';

// **************************************************************************
// BuiltValueGenerator
// **************************************************************************

class _$GroupOverview extends GroupOverview {
  @override
  final String month;
  @override
  final String total;
  @override
  final String previousTotal;
  @override
  final int receiptCount;
  @override
  final int openReceiptCount;
  @override
  final String unhealthyTotal;
  @override
  final BuiltList<GroupOverviewCategory> categories;
  @override
  final BuiltList<GroupOverviewMonth> months;
  @override
  final String? from;
  @override
  final String? to;
  @override
  final String? previousFrom;
  @override
  final String? previousTo;
  @override
  final int? previousReceiptCount;
  @override
  final String? previousUnhealthyTotal;
  @override
  final String? unplannedTotal;
  @override
  final String? previousUnplannedTotal;
  @override
  final BuiltList<GroupOverviewMonth>? trend;
  @override
  final String? trendUnit;

  factory _$GroupOverview([void Function(GroupOverviewBuilder)? updates]) =>
      (GroupOverviewBuilder()..update(updates))._build();

  _$GroupOverview._(
      {required this.month,
      required this.total,
      required this.previousTotal,
      required this.receiptCount,
      required this.openReceiptCount,
      required this.unhealthyTotal,
      required this.categories,
      required this.months,
      this.from,
      this.to,
      this.previousFrom,
      this.previousTo,
      this.previousReceiptCount,
      this.previousUnhealthyTotal,
      this.unplannedTotal,
      this.previousUnplannedTotal,
      this.trend,
      this.trendUnit})
      : super._();
  @override
  GroupOverview rebuild(void Function(GroupOverviewBuilder) updates) =>
      (toBuilder()..update(updates)).build();

  @override
  GroupOverviewBuilder toBuilder() => GroupOverviewBuilder()..replace(this);

  @override
  bool operator ==(Object other) {
    if (identical(other, this)) return true;
    return other is GroupOverview &&
        month == other.month &&
        total == other.total &&
        previousTotal == other.previousTotal &&
        receiptCount == other.receiptCount &&
        openReceiptCount == other.openReceiptCount &&
        unhealthyTotal == other.unhealthyTotal &&
        categories == other.categories &&
        months == other.months &&
        from == other.from &&
        to == other.to &&
        previousFrom == other.previousFrom &&
        previousTo == other.previousTo &&
        previousReceiptCount == other.previousReceiptCount &&
        previousUnhealthyTotal == other.previousUnhealthyTotal &&
        unplannedTotal == other.unplannedTotal &&
        previousUnplannedTotal == other.previousUnplannedTotal &&
        trend == other.trend &&
        trendUnit == other.trendUnit;
  }

  @override
  int get hashCode {
    var _$hash = 0;
    _$hash = $jc(_$hash, month.hashCode);
    _$hash = $jc(_$hash, total.hashCode);
    _$hash = $jc(_$hash, previousTotal.hashCode);
    _$hash = $jc(_$hash, receiptCount.hashCode);
    _$hash = $jc(_$hash, openReceiptCount.hashCode);
    _$hash = $jc(_$hash, unhealthyTotal.hashCode);
    _$hash = $jc(_$hash, categories.hashCode);
    _$hash = $jc(_$hash, months.hashCode);
    _$hash = $jc(_$hash, from.hashCode);
    _$hash = $jc(_$hash, to.hashCode);
    _$hash = $jc(_$hash, previousFrom.hashCode);
    _$hash = $jc(_$hash, previousTo.hashCode);
    _$hash = $jc(_$hash, previousReceiptCount.hashCode);
    _$hash = $jc(_$hash, previousUnhealthyTotal.hashCode);
    _$hash = $jc(_$hash, unplannedTotal.hashCode);
    _$hash = $jc(_$hash, previousUnplannedTotal.hashCode);
    _$hash = $jc(_$hash, trend.hashCode);
    _$hash = $jc(_$hash, trendUnit.hashCode);
    _$hash = $jf(_$hash);
    return _$hash;
  }

  @override
  String toString() {
    return (newBuiltValueToStringHelper(r'GroupOverview')
          ..add('month', month)
          ..add('total', total)
          ..add('previousTotal', previousTotal)
          ..add('receiptCount', receiptCount)
          ..add('openReceiptCount', openReceiptCount)
          ..add('unhealthyTotal', unhealthyTotal)
          ..add('categories', categories)
          ..add('months', months)
          ..add('from', from)
          ..add('to', to)
          ..add('previousFrom', previousFrom)
          ..add('previousTo', previousTo)
          ..add('previousReceiptCount', previousReceiptCount)
          ..add('previousUnhealthyTotal', previousUnhealthyTotal)
          ..add('unplannedTotal', unplannedTotal)
          ..add('previousUnplannedTotal', previousUnplannedTotal)
          ..add('trend', trend)
          ..add('trendUnit', trendUnit))
        .toString();
  }
}

class GroupOverviewBuilder
    implements Builder<GroupOverview, GroupOverviewBuilder> {
  _$GroupOverview? _$v;

  String? _month;
  String? get month => _$this._month;
  set month(String? month) => _$this._month = month;

  String? _total;
  String? get total => _$this._total;
  set total(String? total) => _$this._total = total;

  String? _previousTotal;
  String? get previousTotal => _$this._previousTotal;
  set previousTotal(String? previousTotal) =>
      _$this._previousTotal = previousTotal;

  int? _receiptCount;
  int? get receiptCount => _$this._receiptCount;
  set receiptCount(int? receiptCount) => _$this._receiptCount = receiptCount;

  int? _openReceiptCount;
  int? get openReceiptCount => _$this._openReceiptCount;
  set openReceiptCount(int? openReceiptCount) =>
      _$this._openReceiptCount = openReceiptCount;

  String? _unhealthyTotal;
  String? get unhealthyTotal => _$this._unhealthyTotal;
  set unhealthyTotal(String? unhealthyTotal) =>
      _$this._unhealthyTotal = unhealthyTotal;

  ListBuilder<GroupOverviewCategory>? _categories;
  ListBuilder<GroupOverviewCategory> get categories =>
      _$this._categories ??= ListBuilder<GroupOverviewCategory>();
  set categories(ListBuilder<GroupOverviewCategory>? categories) =>
      _$this._categories = categories;

  ListBuilder<GroupOverviewMonth>? _months;
  ListBuilder<GroupOverviewMonth> get months =>
      _$this._months ??= ListBuilder<GroupOverviewMonth>();
  set months(ListBuilder<GroupOverviewMonth>? months) =>
      _$this._months = months;

  String? _from;
  String? get from => _$this._from;
  set from(String? from) => _$this._from = from;

  String? _to;
  String? get to => _$this._to;
  set to(String? to) => _$this._to = to;

  String? _previousFrom;
  String? get previousFrom => _$this._previousFrom;
  set previousFrom(String? previousFrom) => _$this._previousFrom = previousFrom;

  String? _previousTo;
  String? get previousTo => _$this._previousTo;
  set previousTo(String? previousTo) => _$this._previousTo = previousTo;

  int? _previousReceiptCount;
  int? get previousReceiptCount => _$this._previousReceiptCount;
  set previousReceiptCount(int? previousReceiptCount) =>
      _$this._previousReceiptCount = previousReceiptCount;

  String? _previousUnhealthyTotal;
  String? get previousUnhealthyTotal => _$this._previousUnhealthyTotal;
  set previousUnhealthyTotal(String? previousUnhealthyTotal) =>
      _$this._previousUnhealthyTotal = previousUnhealthyTotal;

  String? _unplannedTotal;
  String? get unplannedTotal => _$this._unplannedTotal;
  set unplannedTotal(String? unplannedTotal) =>
      _$this._unplannedTotal = unplannedTotal;

  String? _previousUnplannedTotal;
  String? get previousUnplannedTotal => _$this._previousUnplannedTotal;
  set previousUnplannedTotal(String? previousUnplannedTotal) =>
      _$this._previousUnplannedTotal = previousUnplannedTotal;

  ListBuilder<GroupOverviewMonth>? _trend;
  ListBuilder<GroupOverviewMonth> get trend =>
      _$this._trend ??= ListBuilder<GroupOverviewMonth>();
  set trend(ListBuilder<GroupOverviewMonth>? trend) => _$this._trend = trend;

  String? _trendUnit;
  String? get trendUnit => _$this._trendUnit;
  set trendUnit(String? trendUnit) => _$this._trendUnit = trendUnit;

  GroupOverviewBuilder() {
    GroupOverview._defaults(this);
  }

  GroupOverviewBuilder get _$this {
    final $v = _$v;
    if ($v != null) {
      _month = $v.month;
      _total = $v.total;
      _previousTotal = $v.previousTotal;
      _receiptCount = $v.receiptCount;
      _openReceiptCount = $v.openReceiptCount;
      _unhealthyTotal = $v.unhealthyTotal;
      _categories = $v.categories.toBuilder();
      _months = $v.months.toBuilder();
      _from = $v.from;
      _to = $v.to;
      _previousFrom = $v.previousFrom;
      _previousTo = $v.previousTo;
      _previousReceiptCount = $v.previousReceiptCount;
      _previousUnhealthyTotal = $v.previousUnhealthyTotal;
      _unplannedTotal = $v.unplannedTotal;
      _previousUnplannedTotal = $v.previousUnplannedTotal;
      _trend = $v.trend?.toBuilder();
      _trendUnit = $v.trendUnit;
      _$v = null;
    }
    return this;
  }

  @override
  void replace(GroupOverview other) {
    _$v = other as _$GroupOverview;
  }

  @override
  void update(void Function(GroupOverviewBuilder)? updates) {
    if (updates != null) updates(this);
  }

  @override
  GroupOverview build() => _build();

  _$GroupOverview _build() {
    _$GroupOverview _$result;
    try {
      _$result = _$v ??
          _$GroupOverview._(
            month: BuiltValueNullFieldError.checkNotNull(
                month, r'GroupOverview', 'month'),
            total: BuiltValueNullFieldError.checkNotNull(
                total, r'GroupOverview', 'total'),
            previousTotal: BuiltValueNullFieldError.checkNotNull(
                previousTotal, r'GroupOverview', 'previousTotal'),
            receiptCount: BuiltValueNullFieldError.checkNotNull(
                receiptCount, r'GroupOverview', 'receiptCount'),
            openReceiptCount: BuiltValueNullFieldError.checkNotNull(
                openReceiptCount, r'GroupOverview', 'openReceiptCount'),
            unhealthyTotal: BuiltValueNullFieldError.checkNotNull(
                unhealthyTotal, r'GroupOverview', 'unhealthyTotal'),
            categories: categories.build(),
            months: months.build(),
            from: from,
            to: to,
            previousFrom: previousFrom,
            previousTo: previousTo,
            previousReceiptCount: previousReceiptCount,
            previousUnhealthyTotal: previousUnhealthyTotal,
            unplannedTotal: unplannedTotal,
            previousUnplannedTotal: previousUnplannedTotal,
            trend: _trend?.build(),
            trendUnit: trendUnit,
          );
    } catch (_) {
      late String _$failedField;
      try {
        _$failedField = 'categories';
        categories.build();
        _$failedField = 'months';
        months.build();

        _$failedField = 'trend';
        _trend?.build();
      } catch (e) {
        throw BuiltValueNestedFieldError(
            r'GroupOverview', _$failedField, e.toString());
      }
      rethrow;
    }
    replace(_$result);
    return _$result;
  }
}

// ignore_for_file: deprecated_member_use_from_same_package,type=lint
