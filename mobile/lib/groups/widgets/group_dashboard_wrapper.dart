import 'package:flutter/material.dart';
import 'package:receipt_wrangler_mobile/groups/widgets/group_dashboard.dart';
import 'package:receipt_wrangler_mobile/shared/widgets/circular_loading_progress.dart';
import 'package:receipt_wrangler_mobile/utils/group.dart';

import '../../client/client.dart';

class GroupDashboardWrapper extends StatefulWidget {
  const GroupDashboardWrapper({super.key});

  @override
  State<GroupDashboardWrapper> createState() => _GroupDashboardWrapper();
}

class _GroupDashboardWrapper extends State<GroupDashboardWrapper> {
  late Future _dashboardFuture;
  bool _isInitialized = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (!_isInitialized) {
      _loadData();
      _isInitialized = true;
    }
  }

  void _loadData() {
    var groupId = getGroupId(context);
    _dashboardFuture = OpenApiClient.client
        .getDashboardApi()
        .getDashboardsForUserByGroupId(groupId: groupId);
  }

  @override
  Widget build(BuildContext context) {
    return FutureBuilder(
        future: _dashboardFuture,
        builder: (context, snapshot) {
          if (snapshot.connectionState == ConnectionState.done) {
            if (snapshot.hasError) {
              return const Center(
                child: Text("Failed to load dashboards"),
              );
            }
            return GroupDashboard(
              dashboards: snapshot.data?.data?.toList() ?? [],
            );
          }

          return const CircularLoadingProgress();
        });
  }
}
