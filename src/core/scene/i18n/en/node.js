module.exports = {
    'cc': {
        'Node': {
            'properties': {
                'position': {
                    displayName: 'Position',
                    tooltip: 'Position coordinates in local space.',
                },
                'eulerAngles': {
                    displayName: 'Rotation',
                    tooltip2D: 'The degree of rotation in counter clockwise.',
                    tooltip3D: 'The degree of rotation in local space.',
                },
                'scale': {
                    displayName: 'Scale',
                    tooltip: 'The scaling of this node in local space.',
                },
                'mobility': {
                    displayName: 'Mobility',
                    tooltip: 'Node\'s mobility',
                },
                'layer': {
                    displayName: 'Layer',
                    tooltip: 'Layer of the current Node, it affects raycast, physics etc.',
                },
            }
        }
    }
}