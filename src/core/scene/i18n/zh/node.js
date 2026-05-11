module.exports = {
    'cc': {
        'Node': {
            'properties': {
                'position': {
                    displayName: 'Position',
                    tooltip: '相对父节点的位置坐标',
                },
                'eulerAngles': {
                    displayName: 'Rotation',
                    tooltip2D: '旋转角度，输入正值时逆时针旋转。',
                    tooltip3D: '相对父节点的旋转角度。',
                },
                'scale': {
                    displayName: 'Scale',
                    tooltip: '相对父节点的整体缩放比例',
                },
                'mobility': {
                    displayName: 'Mobility',
                    tooltip: '节点的移动性',
                },
                'layer': {
                    displayName: 'Layer',
                    tooltip: '节点所属层，主要影响射线检测、物理碰撞等',
                },
            }
        }
    }
}