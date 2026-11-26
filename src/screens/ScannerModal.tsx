import { CameraView, useCameraPermissions, type BarcodeType } from 'expo-camera';
import React from 'react';
import { Linking, Text, Vibration, View } from 'react-native';
import { BigButton, Field, Sheet } from '../components/ui';
import { useColors } from '../theme';

const BARCODE_TYPES: BarcodeType[] = ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128'];

export function ScannerModal(props: { visible: boolean; onClose: () => void; onScanned: (code: string) => void }) {
  const c = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = React.useState('');
  const locked = React.useRef(false);

  React.useEffect(() => {
    if (props.visible) {
      locked.current = false;
      setManual('');
      if (permission && !permission.granted && permission.canAskAgain) requestPermission();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.visible]);

  const handle = (raw: string) => {
    const code = raw.trim();
    if (!code || locked.current) return;
    locked.current = true;
    Vibration.vibrate(80);
    props.onScanned(code);
  };

  let camera: React.ReactNode;
  if (!permission) {
    camera = <Text style={{ color: c.muted, fontSize: 16 }}>Vérification des autorisations…</Text>;
  } else if (!permission.granted) {
    camera = (
      <View style={{ gap: 12 }}>
        <Text style={{ color: c.text, fontSize: 16 }}>
          L’accès à la caméra est nécessaire pour scanner. Vous pouvez aussi saisir le code à la main ci-dessous.
        </Text>
        {permission.canAskAgain ? (
          <BigButton title="Autoriser la caméra" onPress={requestPermission} />
        ) : (
          <BigButton title="Ouvrir les réglages" variant="secondary" onPress={() => Linking.openSettings()} />
        )}
      </View>
    );
  } else {
    camera = (
      <View style={{ height: 320, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' }}>
        {props.visible ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: BARCODE_TYPES }}
            onBarcodeScanned={(r) => handle(r.data)}
          />
        ) : null}
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: '10%',
            right: '10%',
            top: '40%',
            height: '20%',
            borderWidth: 3,
            borderColor: 'rgba(255,255,255,0.85)',
            borderRadius: 12,
          }}
        />
      </View>
    );
  }

  return (
    <Sheet visible={props.visible} title="Scanner un code-barres" onClose={props.onClose}>
      {camera}
      <View style={{ marginTop: 24 }}>
        <Field
          label="Saisie manuelle du code"
          value={manual}
          onChangeText={setManual}
          keyboardType="number-pad"
          placeholder="ex. 3017620422003"
          returnKeyType="search"
          onSubmitEditing={() => handle(manual)}
        />
        <BigButton title="Rechercher ce code" variant="secondary" disabled={!manual.trim()} onPress={() => handle(manual)} />
      </View>
    </Sheet>
  );
}
