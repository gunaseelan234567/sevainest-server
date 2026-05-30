const AuditLog = require('../models/AuditLog');

// Get all audit logs (Admin only)
exports.getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 50, actionType, startDate, endDate, search } = req.query;

    const query = {};

    if (actionType) {
      query.actionType = actionType;
    }

    if (startDate || endDate) {
      query.timestamp = {};
      if (startDate) {
        query.timestamp.$gte = new Date(startDate);
      }
      if (endDate) {
        query.timestamp.$lte = new Date(endDate);
      }
    }

    // Advanced search on targetCollection, targetId, role
    if (search) {
      query.$or = [
        { role: { $regex: search, $options: 'i' } },
        { targetCollection: { $regex: search, $options: 'i' } },
        { targetId: { $regex: search, $options: 'i' } },
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get logs with pagination
    const logs = await AuditLog.find(query)
      .populate('adminId', 'name email')
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const total = await AuditLog.countDocuments(query);

    res.json({
      success: true,
      data: logs,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Export audit logs format
exports.exportAuditLogs = async (req, res) => {
  try {
    const logs = await AuditLog.find({})
      .populate('adminId', 'name email')
      .sort({ timestamp: -1 })
      .lean();

    // Generate CSV string
    let csv = 'Timestamp,Admin Name,Admin Email,Role,Action Type,Target Collection,Target ID,IP Address,User Agent\n';
    
    logs.forEach(log => {
      const timestamp = log.timestamp ? new Date(log.timestamp).toISOString() : '';
      const name = log.adminId ? `"${log.adminId.name.replace(/"/g, '""')}"` : 'Guest';
      const email = log.adminId ? log.adminId.email : 'N/A';
      const role = log.role || 'guest';
      const action = log.actionType || 'other';
      const collection = log.targetCollection || '';
      const targetId = log.targetId || '';
      const ip = log.ipAddress || '';
      const ua = `"${(log.userAgent || '').replace(/"/g, '""')}"`;

      csv += `${timestamp},${name},${email},${role},${action},${collection},${targetId},${ip},${ua}\n`;
    });

    res.header('Content-Type', 'text/csv');
    res.attachment('audit_logs.csv');
    return res.send(csv);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
