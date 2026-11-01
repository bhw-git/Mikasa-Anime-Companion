import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EmotionProfile, LoadedModelMeta } from '../types/assistant';
import { audioEngine } from '../services/audioEngine';
import {
  saveCustomModelToDB,
  getActiveCustomModel,
  clearCustomModelFromDB,
  saveCustomModelUrl,
  getSavedCustomModelUrl,
} from '../services/modelStorage';

interface ThreeViewportProps {
  currentEmotion: EmotionProfile;
  isSpeaking: boolean;
  onModelLoaded?: (meta: LoadedModelMeta) => void;
  activeAnimationName?: string;
  onCharacterClicked?: () => void;
  customModelUrlToLoad?: string | null;
  restoreDefaultTrigger?: number;
}

export const ThreeViewport: React.FC<ThreeViewportProps> = ({
  currentEmotion,
  isSpeaking,
  onModelLoaded,
  activeAnimationName,
  onCharacterClicked,
  customModelUrlToLoad,
  restoreDefaultTrigger,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState<number | null>(null);
  const [hasLoadedModel, setHasLoadedModel] = useState(false);

  // Mutable refs for Three.js scene loop
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);

  const characterGroupRef = useRef<THREE.Group | null>(null);
  const customModelRef = useRef<THREE.Object3D | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const animationActionsRef = useRef<Map<string, THREE.AnimationAction>>(new Map());

  // Procedural rig targets for animating custom female anime models
  const customRigRef = useRef<{
    basePosY: number;
    baseRotY: number;
    basePosZ: number;
    headBone: THREE.Object3D | null;
    baseHeadRot: { x: number; y: number; z: number };
    spineBone: THREE.Object3D | null;
    baseSpineRot: { x: number; y: number; z: number };
    jawBone: THREE.Object3D | null;
    baseJawRot: { x: number; y: number; z: number };
    leftArmBones: Array<{
      bone: THREE.Object3D;
      isUpper: boolean;
      isForearm: boolean;
      baseRot: { x: number; y: number; z: number };
      targetRot: { x: number; y: number; z: number };
    }>;
    rightArmBones: Array<{
      bone: THREE.Object3D;
      isUpper: boolean;
      isForearm: boolean;
      baseRot: { x: number; y: number; z: number };
      targetRot: { x: number; y: number; z: number };
    }>;
    eyeBones: Array<{
      bone: THREE.Object3D;
      isLeft: boolean;
      baseRot: { x: number; y: number; z: number };
    }>;
    hairBones: Array<{
      bone: THREE.Object3D;
      baseZ: number;
      baseX: number;
      baseY: number;
    }>;
    eyeLookMorphs: {
      left: Array<{ mesh: THREE.Mesh; index: number }>;
      right: Array<{ mesh: THREE.Mesh; index: number }>;
      up: Array<{ mesh: THREE.Mesh; index: number }>;
      down: Array<{ mesh: THREE.Mesh; index: number }>;
    };
    mouthMorphs: Array<{ mesh: THREE.Mesh; index: number }>;
    blinkMorphs: Array<{ mesh: THREE.Mesh; index: number }>;
    smileMorphs: Array<{ mesh: THREE.Mesh; index: number }>;
  }>({
    basePosY: 0,
    baseRotY: 0,
    basePosZ: 0,
    headBone: null,
    baseHeadRot: { x: 0, y: 0, z: 0 },
    spineBone: null,
    baseSpineRot: { x: 0, y: 0, z: 0 },
    jawBone: null,
    baseJawRot: { x: 0, y: 0, z: 0 },
    leftArmBones: [],
    rightArmBones: [],
    eyeBones: [],
    hairBones: [],
    eyeLookMorphs: { left: [], right: [], up: [], down: [] },
    mouthMorphs: [],
    blinkMorphs: [],
    smileMorphs: [],
  });

  // Procedural rig references for reactive animation
  const headBoneRef = useRef<THREE.Object3D | null>(null);
  const torsoGroupRef = useRef<THREE.Group | null>(null);
  const leftEyeRef = useRef<THREE.Object3D | null>(null);
  const rightEyeRef = useRef<THREE.Object3D | null>(null);
  const leftLashRef = useRef<THREE.Object3D | null>(null);
  const rightLashRef = useRef<THREE.Object3D | null>(null);
  const mouthMeshRef = useRef<THREE.Mesh | null>(null);
  const blushLeftRef = useRef<THREE.Mesh | null>(null);
  const blushRightRef = useRef<THREE.Mesh | null>(null);
  const hairGroupRef = useRef<THREE.Group | null>(null);
  const sideLockLRef = useRef<THREE.Mesh | null>(null);
  const sideLockRRef = useRef<THREE.Mesh | null>(null);
  const bunLRef = useRef<THREE.Mesh | null>(null);
  const bunRRef = useRef<THREE.Mesh | null>(null);

  // Mouse & Gaze tracking with velocity calculation for dynamic reactive physics
  const mouseRef = useRef({
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    velX: 0,
    velY: 0,
  });
  const blinkTimerRef = useRef({
    nextBlink: 2.2,
    isBlinking: false,
    blinkDuration: 0.14,
    elapsed: 0,
    isDoubleBlink: false,
  });
  const winkTimerRef = useRef({ active: false, eye: 'left', elapsed: 0, duration: 0.45 });
  const touchReactionRef = useRef(0);
  const cuteEyeGazeRef = useRef({
    glanceX: 0,
    glanceY: 0,
    targetGlanceX: 0,
    targetGlanceY: 0,
    timer: 2.0,
  });

  // Keep emotion and speaking in refs for high-rate animation loop
  const emotionRef = useRef(currentEmotion);
  useEffect(() => {
    emotionRef.current = currentEmotion;
    touchReactionRef.current = 1.0;
    // Playful wink trigger on flirty/sexy emotion changes
    if (currentEmotion.id === 'playful_flirty' || currentEmotion.id === 'seductive_sexy') {
      winkTimerRef.current.active = true;
      winkTimerRef.current.elapsed = 0;
      audioEngine.playAnimeChime('wink');
    }
  }, [currentEmotion]);

  const speakingRef = useRef(isSpeaking);
  useEffect(() => {
    speakingRef.current = isSpeaking;
  }, [isSpeaking]);

  /**
   * Helper: create high-resolution anime eye texture with deep pupils and sparkles
   */
  const createAnimeEyeTexture = useCallback(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    // Sclera (Soft white)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 256, 256);

    // Outer Iris (Deep violet sapphire gradient with romantic warmth)
    const irisGrad = ctx.createRadialGradient(128, 140, 15, 128, 140, 105);
    irisGrad.addColorStop(0, '#c084fc');
    irisGrad.addColorStop(0.35, '#818cf8');
    irisGrad.addColorStop(0.7, '#4338ca');
    irisGrad.addColorStop(1, '#1e1b4b');

    ctx.fillStyle = irisGrad;
    ctx.beginPath();
    ctx.arc(128, 140, 88, 0, Math.PI * 2);
    ctx.fill();

    // Pupil
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(128, 140, 38, 0, Math.PI * 2);
    ctx.fill();

    // Secondary soft reflection
    ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.beginPath();
    ctx.arc(105, 168, 14, 0, Math.PI * 2);
    ctx.fill();

    // Big bright anime specular highlight (gives the lively, loving partner sparkle)
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(102, 110, 26, 0, Math.PI * 2);
    ctx.fill();

    // Cute starlet twinkle highlight
    ctx.beginPath();
    ctx.arc(154, 148, 10, 0, Math.PI * 2);
    ctx.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);

  /**
   * Helper: create soft radial blush gradient
   */
  const createBlushTexture = useCallback(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.Texture();

    const gradient = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
    gradient.addColorStop(0, 'rgba(255, 90, 140, 0.95)');
    gradient.addColorStop(0.4, 'rgba(255, 90, 140, 0.6)');
    gradient.addColorStop(0.8, 'rgba(255, 90, 140, 0.15)');
    gradient.addColorStop(1, 'rgba(255, 90, 140, 0)');

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);

  /**
   * Build the intricate procedural anime virtual partner bust
   */
  const buildProceduralAnimeBust = useCallback(() => {
    const group = new THREE.Group();
    group.name = 'ProceduralAnimePartner';

    // Materials
    const skinMaterial = new THREE.MeshStandardMaterial({
      color: 0xffebd9,
      roughness: 0.55,
      metalness: 0.05,
    });

    // Lustrous indigo-violet anime hair
    const hairMaterial = new THREE.MeshStandardMaterial({
      color: 0x4338ca,
      roughness: 0.4,
      metalness: 0.15,
    });

    const hairHighlightMat = new THREE.MeshStandardMaterial({
      color: 0x818cf8,
      roughness: 0.3,
      metalness: 0.2,
    });

    const dressMaterial = new THREE.MeshStandardMaterial({
      color: 0x18181b,
      roughness: 0.65,
      metalness: 0.15,
    });

    const ribbonMaterial = new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      roughness: 0.35,
      metalness: 0.1,
    });

    // 1. Torso & Shoulders Group
    const torso = new THREE.Group();
    torso.name = 'TorsoGroup';

    // Upper chest with feminine partner curvature
    const chestGeom = new THREE.CylinderGeometry(0.52, 0.62, 0.95, 24);
    chestGeom.scale(1.2, 1.0, 0.72);
    const chestMesh = new THREE.Mesh(chestGeom, dressMaterial);
    chestMesh.position.y = -0.55;
    chestMesh.castShadow = true;
    chestMesh.receiveShadow = true;
    torso.add(chestMesh);

    // Collarbone and sweetheart neckline detail
    const collarGeom = new THREE.TorusGeometry(0.25, 0.05, 12, 32);
    collarGeom.rotateX(Math.PI / 2);
    const collarMesh = new THREE.Mesh(collarGeom, ribbonMaterial);
    collarMesh.position.set(0, -0.1, 0.06);
    collarMesh.scale.set(1.15, 0.9, 1.0);
    torso.add(collarMesh);

    // Shoulders
    const shoulderGeom = new THREE.SphereGeometry(0.22, 16, 16);
    const shoulderL = new THREE.Mesh(shoulderGeom, dressMaterial);
    shoulderL.position.set(-0.62, -0.42, 0);
    shoulderL.scale.set(1.05, 0.85, 0.9);
    const shoulderR = new THREE.Mesh(shoulderGeom, dressMaterial);
    shoulderR.position.set(0.62, -0.42, 0);
    shoulderR.scale.set(1.05, 0.85, 0.9);
    torso.add(shoulderL, shoulderR);

    torsoGroupRef.current = torso;
    group.add(torso);

    // 2. Slender Neck
    const neckGeom = new THREE.CylinderGeometry(0.13, 0.16, 0.42, 20);
    const neckMesh = new THREE.Mesh(neckGeom, skinMaterial);
    neckMesh.position.y = 0.08;
    neckMesh.castShadow = true;
    group.add(neckMesh);

    // Choker ribbon on neck
    const chokerGeom = new THREE.CylinderGeometry(0.14, 0.14, 0.06, 20);
    const chokerMesh = new THREE.Mesh(chokerGeom, ribbonMaterial);
    chokerMesh.position.y = 0.05;
    group.add(chokerMesh);

    // 3. Head & Face Rig
    const headGroup = new THREE.Group();
    headGroup.name = 'HeadRig';
    headGroup.position.set(0, 0.32, 0.02);

    // Anime Head Base
    const headGeom = new THREE.SphereGeometry(0.48, 32, 24);
    headGeom.scale(0.92, 1.05, 0.96);
    const headMesh = new THREE.Mesh(headGeom, skinMaterial);
    headMesh.castShadow = true;
    headGroup.add(headMesh);

    // Tapered cute anime chin & jaw contour
    const chinGeom = new THREE.CylinderGeometry(0.06, 0.36, 0.46, 16);
    chinGeom.scale(0.85, 1.0, 0.7);
    const chinMesh = new THREE.Mesh(chinGeom, skinMaterial);
    chinMesh.position.set(0, -0.22, 0.12);
    chinMesh.rotation.x = 0.25;
    headGroup.add(chinMesh);

    // Anime Nose
    const noseGeom = new THREE.ConeGeometry(0.022, 0.055, 6);
    noseGeom.rotateX(Math.PI / 2);
    const noseMesh = new THREE.Mesh(noseGeom, skinMaterial);
    noseMesh.position.set(0, -0.04, 0.485);
    headGroup.add(noseMesh);

    // Eyes
    const eyeTex = createAnimeEyeTexture();
    const eyeMaterial = new THREE.MeshBasicMaterial({
      map: eyeTex,
      transparent: true,
    });
    const eyeGeom = new THREE.PlaneGeometry(0.22, 0.26);

    const leftEye = new THREE.Mesh(eyeGeom, eyeMaterial);
    leftEye.position.set(-0.17, 0.06, 0.45);
    leftEye.rotation.set(-0.05, 0.2, 0.02);

    const rightEye = new THREE.Mesh(eyeGeom, eyeMaterial);
    rightEye.position.set(0.17, 0.06, 0.45);
    rightEye.rotation.set(-0.05, -0.2, -0.02);

    headGroup.add(leftEye);
    headGroup.add(rightEye);
    leftEyeRef.current = leftEye;
    rightEyeRef.current = rightEye;

    // Eyelashes & Eyelids (Curves for blinking and winking)
    const lashMat = new THREE.MeshBasicMaterial({ color: 0x1e1b4b });
    const lashGeom = new THREE.TorusGeometry(0.12, 0.016, 8, 16, Math.PI * 0.75);

    const lashL = new THREE.Mesh(lashGeom, lashMat);
    lashL.position.set(-0.17, 0.18, 0.45);
    lashL.rotation.set(0.1, 0.15, -0.2);

    const lashR = new THREE.Mesh(lashGeom, lashMat);
    lashR.position.set(0.17, 0.18, 0.45);
    lashR.rotation.set(0.1, -0.15, 0.2);

    headGroup.add(lashL, lashR);
    leftLashRef.current = lashL;
    rightLashRef.current = lashR;

    // Eyebrows
    const browGeom = new THREE.BoxGeometry(0.14, 0.018, 0.01);
    const browL = new THREE.Mesh(browGeom, lashMat);
    browL.position.set(-0.17, 0.24, 0.44);
    browL.rotation.set(0, 0, 0.08);

    const browR = new THREE.Mesh(browGeom, lashMat);
    browR.position.set(0.17, 0.24, 0.44);
    browR.rotation.set(0, 0, -0.08);
    headGroup.add(browL, browR);

    // Mouth (Dynamic lip sync & smiling aperture)
    const mouthGeom = new THREE.PlaneGeometry(0.13, 0.06);
    const mouthMat = new THREE.MeshBasicMaterial({
      color: 0xf43f5e,
      side: THREE.DoubleSide,
    });
    const mouthMesh = new THREE.Mesh(mouthGeom, mouthMat);
    mouthMesh.position.set(0, -0.13, 0.465);
    mouthMesh.rotation.set(-0.1, 0, 0);
    headGroup.add(mouthMesh);
    mouthMeshRef.current = mouthMesh;

    // Blush planes (Cheeks)
    const blushTex = createBlushTexture();
    const blushMat = new THREE.MeshBasicMaterial({
      map: blushTex,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });
    const blushGeom = new THREE.PlaneGeometry(0.2, 0.13);

    const blushL = new THREE.Mesh(blushGeom, blushMat.clone());
    blushL.position.set(-0.24, -0.04, 0.42);
    blushL.rotation.set(-0.1, 0.35, 0);

    const blushR = new THREE.Mesh(blushGeom, blushMat.clone());
    blushR.position.set(0.24, -0.04, 0.42);
    blushR.rotation.set(-0.1, -0.35, 0);

    headGroup.add(blushL, blushR);
    blushLeftRef.current = blushL;
    blushRightRef.current = blushR;

    // 4. Stylized Anime Hair with Secondary Physics Sway
    const hairGroup = new THREE.Group();
    hairGroup.name = 'HairGroup';

    // Back hair dome
    const backHairGeom = new THREE.SphereGeometry(0.53, 24, 20);
    backHairGeom.scale(0.96, 1.06, 1.06);
    const backHairMesh = new THREE.Mesh(backHairGeom, hairMaterial);
    backHairMesh.position.set(0, 0.02, -0.06);
    hairGroup.add(backHairMesh);

    // Front Bangs
    const bangGeom = new THREE.ConeGeometry(0.08, 0.42, 8);
    bangGeom.rotateX(Math.PI);

    const centerBang = new THREE.Mesh(bangGeom, hairMaterial);
    centerBang.position.set(0, 0.28, 0.45);
    centerBang.rotation.set(0.2, 0, 0);
    centerBang.scale.set(1.0, 1.1, 0.6);

    const leftBang1 = new THREE.Mesh(bangGeom, hairMaterial);
    leftBang1.position.set(-0.12, 0.26, 0.44);
    leftBang1.rotation.set(0.15, 0.1, 0.2);
    leftBang1.scale.set(0.9, 1.2, 0.5);

    const rightBang1 = new THREE.Mesh(bangGeom, hairMaterial);
    rightBang1.position.set(0.12, 0.26, 0.44);
    rightBang1.rotation.set(0.15, -0.1, -0.2);
    rightBang1.scale.set(0.9, 1.2, 0.5);

    // Flowing Side Hair Locks (physics animated)
    const sideLockL = new THREE.Mesh(bangGeom, hairMaterial);
    sideLockL.position.set(-0.36, 0.1, 0.35);
    sideLockL.rotation.set(0.1, 0.3, 0.4);
    sideLockL.scale.set(1.15, 2.0, 0.7);
    sideLockLRef.current = sideLockL;

    const sideLockR = new THREE.Mesh(bangGeom, hairMaterial);
    sideLockR.position.set(0.36, 0.1, 0.35);
    sideLockR.rotation.set(0.1, -0.3, -0.4);
    sideLockR.scale.set(1.15, 2.0, 0.7);
    sideLockRRef.current = sideLockR;

    hairGroup.add(centerBang, leftBang1, rightBang1, sideLockL, sideLockR);

    // Hair Light Ring / Halo
    const haloGeom = new THREE.TorusGeometry(0.44, 0.025, 8, 24);
    haloGeom.rotateX(Math.PI / 2);
    const haloMesh = new THREE.Mesh(haloGeom, hairHighlightMat);
    haloMesh.position.set(0, 0.36, 0.05);
    haloMesh.scale.set(1.0, 0.9, 1.0);
    hairGroup.add(haloMesh);

    // Twin-Tail Hair Buns / Pigtails
    const bunGeom = new THREE.SphereGeometry(0.19, 16, 16);
    bunGeom.scale(1.0, 1.35, 0.9);

    const bunL = new THREE.Mesh(bunGeom, hairMaterial);
    bunL.position.set(-0.48, 0.38, -0.1);
    bunL.rotation.set(0, 0, 0.4);
    bunLRef.current = bunL;

    const bunR = new THREE.Mesh(bunGeom, hairMaterial);
    bunR.position.set(0.48, 0.38, -0.1);
    bunR.rotation.set(0, 0, -0.4);
    bunRRef.current = bunR;

    hairGroup.add(bunL, bunR);

    headGroup.add(hairGroup);
    hairGroupRef.current = hairGroup;

    group.add(headGroup);
    headBoneRef.current = headGroup;

    return group;
  }, [createAnimeEyeTexture, createBlushTexture]);

  /**
   * Auto-frame camera to intimate head-and-shoulder portrait, positioned slightly to the right
   */
  const frameHeadAndShoulders = useCallback((object: THREE.Object3D) => {
    if (!cameraRef.current || !controlsRef.current) return;

    const box = new THREE.Box3().setFromObject(object);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    // Target between eyes, chin, and collarbone for intimate face-to-shoulder framing
    const headTargetY = box.min.y + size.y * 0.74;

    // Shift camera focus left so the 3D character sits prominently on the right side of the screen
    const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
    const offsetX = isDesktop ? -0.28 : -0.10;
    const target = new THREE.Vector3(center.x + offsetX, headTargetY, center.z);

    controlsRef.current.target.copy(target);

    // Zoom in closer for an intimate, detailed face-to-shoulder view
    const dist = Math.max(size.y * 0.40, 0.88);
    cameraRef.current.position.set(center.x + offsetX, headTargetY + 0.03, center.z + dist);
    cameraRef.current.lookAt(target);

    controlsRef.current.minDistance = 0.5;
    controlsRef.current.maxDistance = 2.0;
    controlsRef.current.update();
  }, []);

  /**
   * Universal setup for parsed GLTF/GLB/VRM scene (used by File, IndexedDB, and URL loaders)
   */
  const setupParsedGLTF = useCallback(
    (gltf: any, fileName: string, fileSize: string) => {
      const scene = sceneRef.current;
      if (!scene) return;

      if (customModelRef.current) {
        scene.remove(customModelRef.current);
        customModelRef.current = null;
      }

      if (characterGroupRef.current) {
        characterGroupRef.current.visible = false;
      }

      const model = gltf.scene;
      model.name = 'CustomAnimeModel';

      let meshCount = 0;
      let boneCount = 0;
      const morphNamesSet = new Set<string>();

      const rig = {
        basePosY: 0,
        baseRotY: 0,
        basePosZ: 0,
        headBone: null as THREE.Object3D | null,
        baseHeadRot: { x: 0, y: 0, z: 0 },
        spineBone: null as THREE.Object3D | null,
        baseSpineRot: { x: 0, y: 0, z: 0 },
        jawBone: null as THREE.Object3D | null,
        baseJawRot: { x: 0, y: 0, z: 0 },
        leftArmBones: [] as Array<{
          bone: THREE.Object3D;
          isUpper: boolean;
          isForearm: boolean;
          baseRot: { x: number; y: number; z: number };
          targetRot: { x: number; y: number; z: number };
        }>,
        rightArmBones: [] as Array<{
          bone: THREE.Object3D;
          isUpper: boolean;
          isForearm: boolean;
          baseRot: { x: number; y: number; z: number };
          targetRot: { x: number; y: number; z: number };
        }>,
        eyeBones: [] as Array<{
          bone: THREE.Object3D;
          isLeft: boolean;
          baseRot: { x: number; y: number; z: number };
        }>,
        hairBones: [] as Array<{
          bone: THREE.Object3D;
          baseZ: number;
          baseX: number;
          baseY: number;
        }>,
        eyeLookMorphs: {
          left: [] as Array<{ mesh: THREE.Mesh; index: number }>,
          right: [] as Array<{ mesh: THREE.Mesh; index: number }>,
          up: [] as Array<{ mesh: THREE.Mesh; index: number }>,
          down: [] as Array<{ mesh: THREE.Mesh; index: number }>,
        },
        mouthMorphs: [] as Array<{ mesh: THREE.Mesh; index: number }>,
        blinkMorphs: [] as Array<{ mesh: THREE.Mesh; index: number }>,
        smileMorphs: [] as Array<{ mesh: THREE.Mesh; index: number }>,
      };

      model.traverse((child: any) => {
        if (child.isMesh) {
          meshCount++;
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.morphTargetDictionary && child.morphTargetInfluences) {
            Object.entries(child.morphTargetDictionary).forEach(([mName, idx]) => {
              morphNamesSet.add(mName);
              const mLower = mName.toLowerCase();
              const numIdx = idx as number;
              // Eye blink
              if (/blink|wink|close|eye_close|eyeclose/i.test(mLower)) {
                rig.blinkMorphs.push({ mesh: child, index: numIdx });
              }
              // Eye look directions for anime models with gaze blendshapes
              if (/look.*left|eye.*left|lookleft/i.test(mLower)) {
                rig.eyeLookMorphs.left.push({ mesh: child, index: numIdx });
              } else if (/look.*right|eye.*right|lookright/i.test(mLower)) {
                rig.eyeLookMorphs.right.push({ mesh: child, index: numIdx });
              } else if (/look.*up|eye.*up|lookup/i.test(mLower)) {
                rig.eyeLookMorphs.up.push({ mesh: child, index: numIdx });
              } else if (/look.*down|eye.*down|lookdown/i.test(mLower)) {
                rig.eyeLookMorphs.down.push({ mesh: child, index: numIdx });
              }
              // Smile / Emotion expression (warmth/eyes/cheeks)
              if (/smile|happy|fun|joy|blush/i.test(mLower)) {
                rig.smileMorphs.push({ mesh: child, index: numIdx });
              }
            });
          }
        }
        if (child.isBone || child.type === 'Bone') {
          boneCount++;
          const nameLower = child.name.toLowerCase();
          if (!rig.headBone && /head/i.test(nameLower) && !/gear|band|acc|phone|light/i.test(nameLower)) {
            rig.headBone = child;
            rig.baseHeadRot = { x: child.rotation.x, y: child.rotation.y, z: child.rotation.z };
          } else if (!rig.spineBone && /spine|chest|upper_body|upperbody/i.test(nameLower)) {
            rig.spineBone = child;
            rig.baseSpineRot = { x: child.rotation.x, y: child.rotation.y, z: child.rotation.z };
          } else if (!rig.jawBone && /jaw|chin/i.test(nameLower)) {
            rig.jawBone = child;
            rig.baseJawRot = { x: child.rotation.x, y: child.rotation.y, z: child.rotation.z };
          } else if (/hair|ribbon|ponytail|twin|bangs|ahoge|front_hair|side_hair|back_hair/i.test(nameLower)) {
            if (rig.hairBones.length < 16) {
              rig.hairBones.push({
                bone: child,
                baseZ: child.rotation.z,
                baseX: child.rotation.x,
                baseY: child.rotation.y,
              });
            }
          }

          // Natural arm and hand posing: Keep hands and arms tucked close to her body
          if (/left.*upper|upper.*arm.*l|upperarm_l|leftarm|arm_l\b|j_bip_l_upperarm/i.test(nameLower)) {
            // Lower left arm naturally against the torso
            const targetRot = {
              x: child.rotation.x + 0.14,
              y: child.rotation.y,
              z: child.rotation.z - 0.72,
            };
            child.rotation.x = targetRot.x;
            child.rotation.z = targetRot.z;
            rig.leftArmBones.push({
              bone: child,
              isUpper: true,
              isForearm: false,
              baseRot: { x: child.rotation.x, y: child.rotation.y, z: child.rotation.z },
              targetRot,
            });
          } else if (/right.*upper|upper.*arm.*r|upperarm_r|rightarm|arm_r\b|j_bip_r_upperarm/i.test(nameLower)) {
            // Lower right arm naturally against the torso
            const targetRot = {
              x: child.rotation.x + 0.14,
              y: child.rotation.y,
              z: child.rotation.z + 0.72,
            };
            child.rotation.x = targetRot.x;
            child.rotation.z = targetRot.z;
            rig.rightArmBones.push({
              bone: child,
              isUpper: true,
              isForearm: false,
              baseRot: { x: child.rotation.x, y: child.rotation.y, z: child.rotation.z },
              targetRot,
            });
          } else if (/left.*lower|lower.*arm.*l|lowerarm_l|forearm.*l|elbow.*l|j_bip_l_lowerarm/i.test(nameLower)) {
            // Angle left forearm slightly inward so hands rest gracefully near hips/thighs
            const targetRot = {
              x: child.rotation.x + 0.22,
              y: child.rotation.y + 0.14,
              z: child.rotation.z + 0.12,
            };
            child.rotation.x = targetRot.x;
            child.rotation.y = targetRot.y;
            child.rotation.z = targetRot.z;
            rig.leftArmBones.push({
              bone: child,
              isUpper: false,
              isForearm: true,
              baseRot: { x: child.rotation.x, y: child.rotation.y, z: child.rotation.z },
              targetRot,
            });
          } else if (/right.*lower|lower.*arm.*r|lowerarm_r|forearm.*r|elbow.*r|j_bip_r_lowerarm/i.test(nameLower)) {
            // Angle right forearm slightly inward so hands rest gracefully near hips/thighs
            const targetRot = {
              x: child.rotation.x + 0.22,
              y: child.rotation.y - 0.14,
              z: child.rotation.z - 0.12,
            };
            child.rotation.x = targetRot.x;
            child.rotation.y = targetRot.y;
            child.rotation.z = targetRot.z;
            rig.rightArmBones.push({
              bone: child,
              isUpper: false,
              isForearm: true,
              baseRot: { x: child.rotation.x, y: child.rotation.y, z: child.rotation.z },
              targetRot,
            });
          } else if (/eye[._]l\b|left.*eye|eye.*left|j_bip_l_eye|j_adj_l_eye|eyeball[._]l|pupil[._]l/i.test(nameLower)) {
            rig.eyeBones.push({
              bone: child,
              isLeft: true,
              baseRot: { x: child.rotation.x, y: child.rotation.y, z: child.rotation.z },
            });
          } else if (/eye[._]r\b|right.*eye|eye.*right|j_bip_r_eye|j_adj_r_eye|eyeball[._]r|pupil[._]r/i.test(nameLower)) {
            rig.eyeBones.push({
              bone: child,
              isLeft: false,
              baseRot: { x: child.rotation.x, y: child.rotation.y, z: child.rotation.z },
            });
          }
        }
      });

      // Normalize scale for portrait framing
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      if (maxDim > 0) {
        const desiredHeight = 1.8;
        model.scale.setScalar(desiredHeight / maxDim);
      }

      rig.basePosY = model.position.y;
      rig.baseRotY = model.rotation.y;
      rig.basePosZ = model.position.z;
      customRigRef.current = rig;

      scene.add(model);
      customModelRef.current = model;

      // Animations
      const animationNames: string[] = [];
      if (gltf.animations && gltf.animations.length > 0) {
        const mixer = new THREE.AnimationMixer(model);
        mixerRef.current = mixer;
        animationActionsRef.current.clear();

        gltf.animations.forEach((clip: THREE.AnimationClip) => {
          animationNames.push(clip.name);
          const action = mixer.clipAction(clip);
          animationActionsRef.current.set(clip.name, action);
        });

        const firstAction = animationActionsRef.current.get(gltf.animations[0].name);
        if (firstAction) firstAction.play();
      }

      frameHeadAndShoulders(model);
      setLoadingProgress(null);
      setHasLoadedModel(true);

      if (onModelLoaded) {
        onModelLoaded({
          fileName,
          fileSize,
          animationClips: animationNames,
          activeClip: animationNames[0] || 'Default Pose',
          meshCount,
          boneCount,
          hasMorphs: morphNamesSet.size > 0,
          morphNames: Array.from(morphNamesSet),
          isCustom: true,
        });
      }
    },
    [frameHeadAndShoulders, onModelLoaded]
  );

  /**
   * Load custom Sketchfab GLTF/GLB/VRM model file and save to IndexedDB
   */
  const loadCustomModelFile = useCallback(
    async (file: File) => {
      setLoadingProgress(20);
      try {
        // Save to IndexedDB so it persists permanently across reloads
        await saveCustomModelToDB(file);
      } catch (err) {
        console.warn('Could not cache file in IndexedDB:', err);
      }

      const objectUrl = URL.createObjectURL(file);
      const loader = new GLTFLoader();

      loader.load(
        objectUrl,
        (gltf) => {
          setupParsedGLTF(gltf, file.name, `${(file.size / (1024 * 1024)).toFixed(2)} MB`);
          URL.revokeObjectURL(objectUrl);
        },
        (progress) => {
          if (progress.total > 0) {
            setLoadingProgress(Math.round((progress.loaded / progress.total) * 100));
          }
        },
        (error) => {
          console.error('Error loading model file:', error);
          setLoadingProgress(null);
          alert(`Failed to load ${file.name}. Please ensure it is a valid GLTF/GLB or VRM file.`);
        }
      );
    },
    [setupParsedGLTF]
  );

  /**
   * Load custom model from direct GLB / VRM URL
   */
  const loadCustomModelFromUrl = useCallback(
    (url: string) => {
      if (!url.trim()) return;
      setLoadingProgress(25);
      saveCustomModelUrl(url);

      const loader = new GLTFLoader();
      loader.load(
        url,
        (gltf) => {
          const fileName = url.split('/').pop()?.split('?')[0] || 'Custom Anime Model';
          setupParsedGLTF(gltf, fileName, 'URL Stream');
        },
        (progress) => {
          if (progress.total > 0) {
            setLoadingProgress(Math.round((progress.loaded / progress.total) * 100));
          }
        },
        (error) => {
          console.error('Error loading model from URL:', error);
          setLoadingProgress(null);
          alert(`Could not load model from URL: ${url}. Please verify CORS headers and URL validity.`);
        }
      );
    },
    [setupParsedGLTF]
  );

  /**
   * Restore default procedural anime partner bust
   */
  const restoreDefaultAnimePartner = useCallback(async () => {
    await clearCustomModelFromDB();
    if (customModelRef.current && sceneRef.current) {
      sceneRef.current.remove(customModelRef.current);
      customModelRef.current = null;
    }
    if (characterGroupRef.current) {
      characterGroupRef.current.visible = true;
      frameHeadAndShoulders(characterGroupRef.current);
    }
    if (onModelLoaded) {
      onModelLoaded({
        fileName: 'Default Anime Mikasa',
        fileSize: 'Procedural Rig',
        animationClips: ['Breathing Sway', 'Gaze Tracking', 'Dynamic Lip Sync'],
        activeClip: 'Breathing Sway',
        meshCount: 14,
        boneCount: 4,
        hasMorphs: true,
        morphNames: ['Blink', 'Wink', 'Smile', 'Blush', 'MouthOpen'],
        isCustom: false,
      });
    }
  }, [frameHeadAndShoulders, onModelLoaded]);

  // Respond to external URL load trigger
  useEffect(() => {
    if (customModelUrlToLoad) {
      loadCustomModelFromUrl(customModelUrlToLoad);
    }
  }, [customModelUrlToLoad, loadCustomModelFromUrl]);

  // Respond to external restore default trigger
  useEffect(() => {
    if (restoreDefaultTrigger && restoreDefaultTrigger > 0) {
      restoreDefaultAnimePartner();
    }
  }, [restoreDefaultTrigger, restoreDefaultAnimePartner]);

  /**
   * Handle active animation change
   */
  useEffect(() => {
    if (!activeAnimationName || !animationActionsRef.current) return;
    const targetAction = animationActionsRef.current.get(activeAnimationName);
    if (targetAction) {
      animationActionsRef.current.forEach((action) => {
        if (action !== targetAction) action.fadeOut(0.3);
      });
      targetAction.reset().fadeIn(0.3).play();
    }
  }, [activeAnimationName]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      loadCustomModelFile(files[0]);
    }
  };

  /**
   * Gaze tracking listener
   */
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      mouseRef.current.targetX = x;
      mouseRef.current.targetY = y;
    };
    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  /**
   * Click reaction handler: cute wink, flirty lean-in, and speech greeting
   */
  const handleViewportClick = () => {
    touchReactionRef.current = 1.0;
    winkTimerRef.current.active = true;
    winkTimerRef.current.elapsed = 0;
    audioEngine.playAnimeChime('flirt');
    if (onCharacterClicked) {
      onCharacterClicked();
    }
  };

  /**
   * Three.js Scene Setup & Animation Render Loop
   */
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    // Pure, clean, simple matte dark background as requested
    scene.background = new THREE.Color(0x0b0d13);
    scene.fog = new THREE.Fog(0x0b0d13, 3, 10);

    const camera = new THREE.PerspectiveCamera(34, container.clientWidth / container.clientHeight, 0.1, 50);
    // Negative offset directs camera to the left, which places the 3D character nicely on the right half
    const isDesktop = container.clientWidth >= 768;
    const initialOffsetX = isDesktop ? -0.28 : -0.10;
    // Zoom in closer (distance 1.12 instead of 1.78) for intimate head-to-shoulder framing
    camera.position.set(initialOffsetX, 0.38, 1.12);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.target.set(initialOffsetX, 0.30, 0);
    // Constrain distance to keep intimate face-to-shoulder portrait focus
    controls.minDistance = 0.5;
    controls.maxDistance = 2.0;
    controls.minPolarAngle = Math.PI * 0.35;
    controls.maxPolarAngle = Math.PI * 0.58;
    controls.minAzimuthAngle = -Math.PI * 0.35;
    controls.maxAzimuthAngle = Math.PI * 0.35;
    controlsRef.current = controls;

    // Portrait Studio 3-Point Lighting
    const keyLight = new THREE.DirectionalLight(0xfff1e6, 2.3);
    keyLight.position.set(1.5, 2.2, 2.0);
    keyLight.castShadow = true;
    scene.add(keyLight);

    const fillLight = new THREE.HemisphereLight(0xdbeafe, 0x1e293b, 1.2);
    fillLight.position.set(0, 3, 0);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0xe0e7ff, 1.6);
    rimLight.position.set(-2, 1.6, -2);
    scene.add(rimLight);

    // Warm subtle accent fill that shifts with her emotion
    const emotionAccentLight = new THREE.PointLight(0xf43f5e, 0.8, 4);
    emotionAccentLight.position.set(0, 0.3, 1.2);
    scene.add(emotionAccentLight);

    // Contact shadow
    const shadowGeo = new THREE.PlaneGeometry(3, 3);
    const shadowMat = new THREE.ShadowMaterial({ opacity: 0.35 });
    const shadowMesh = new THREE.Mesh(shadowGeo, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.position.y = -0.7;
    shadowMesh.receiveShadow = true;
    scene.add(shadowMesh);

    // Restore persistent custom anime model from IndexedDB or URL (built-in model)
    getActiveCustomModel().then((savedRecord) => {
      if (savedRecord) {
        const loader = new GLTFLoader();
        loader.parse(
          savedRecord.data,
          '',
          (gltf) => {
            setupParsedGLTF(gltf, savedRecord.name, `${(savedRecord.size / (1024 * 1024)).toFixed(2)} MB`);
          },
          (err) => {
            console.warn('Could not restore cached custom model from IndexedDB:', err);
          }
        );
      } else {
        const savedUrl = getSavedCustomModelUrl();
        if (savedUrl) {
          loadCustomModelFromUrl(savedUrl);
        }
      }
    });

    const clock = new THREE.Clock();
    let frameId = 0;

    // Master Animation Loop
    const tick = () => {
      frameId = requestAnimationFrame(tick);
      const delta = Math.min(clock.getDelta(), 0.1);
      const elapsed = clock.getElapsedTime();

      if (mixerRef.current) {
        mixerRef.current.update(delta);
      }

      // Smooth mouse tracking and calculate cursor velocity for reactive physics
      const prevX = mouseRef.current.x;
      const prevY = mouseRef.current.y;
      mouseRef.current.x = THREE.MathUtils.damp(mouseRef.current.x, mouseRef.current.targetX, 5.0, delta);
      mouseRef.current.y = THREE.MathUtils.damp(mouseRef.current.y, mouseRef.current.targetY, 5.0, delta);
      const instantVelX = (mouseRef.current.x - prevX) / Math.max(delta, 0.001);
      const instantVelY = (mouseRef.current.y - prevY) / Math.max(delta, 0.001);
      mouseRef.current.velX = THREE.MathUtils.damp(mouseRef.current.velX, instantVelX, 7.0, delta);
      mouseRef.current.velY = THREE.MathUtils.damp(mouseRef.current.velY, instantVelY, 7.0, delta);

      if (touchReactionRef.current > 0.001) {
        touchReactionRef.current = THREE.MathUtils.damp(touchReactionRef.current, 0, 4, delta);
      }

      const activeEmotion = emotionRef.current;
      emotionAccentLight.color.set(activeEmotion.accentTone);

      // Leaning forward when answering / replying to the user
      const isReplying = speakingRef.current;
      const replyingLeanZ = isReplying ? 0.38 : 0.0;
      const replyingSpinePitch = isReplying ? 0.16 : 0.0;
      const replyingHeadTilt = isReplying ? -0.08 : 0.0;

      // --- PROCEDURAL ANIMATIONS FOR CUSTOM FEMALE ANIME MODEL ---
      if (customModelRef.current) {
        const rig = customRigRef.current;

        // 1. Natural Feminine Breathing
        const breath = Math.sin(elapsed * 2.2) * 0.007;
        customModelRef.current.position.y = rig.basePosY + breath;

        // 2. Feminine Idle Body & Hip Sway
        const swayY = Math.sin(elapsed * 1.0) * 0.014;
        customModelRef.current.rotation.y = rig.baseRotY + swayY;

        // 3. Pronounced Flirty Lean-In: Leans forward gracefully towards the screen when replying
        const targetLeanZ = rig.basePosZ + activeEmotion.leanForward + replyingLeanZ + touchReactionRef.current * 0.08;
        customModelRef.current.position.z = THREE.MathUtils.damp(
          customModelRef.current.position.z,
          targetLeanZ,
          3.8,
          delta
        );

        // 4. Subtle Spine / Chest Breathing and Leaning Forward toward Screen
        if (rig.spineBone) {
          const breathPitch = Math.sin(elapsed * 2.2) * 0.012;
          rig.spineBone.rotation.x = THREE.MathUtils.damp(
            rig.spineBone.rotation.x,
            rig.baseSpineRot.x + breathPitch + replyingSpinePitch,
            4.5,
            delta
          );
        }

        // 5. Head Gaze Tracking & Sweet Anime Tilt (lifts head slightly when leaning forward to maintain direct eye contact)
        const targetGazeY = -mouseRef.current.x * 0.28 + (activeEmotion.headTiltDeg * Math.PI) / 180;
        const targetGazeX = mouseRef.current.y * 0.18 + replyingHeadTilt + (touchReactionRef.current > 0 ? 0.05 : 0);
        const targetGazeZ = -mouseRef.current.x * 0.05 + (activeEmotion.headTiltDeg * Math.PI) / 360;

        if (rig.headBone) {
          rig.headBone.rotation.y = THREE.MathUtils.damp(
            rig.headBone.rotation.y,
            rig.baseHeadRot.y + targetGazeY,
            5,
            delta
          );
          rig.headBone.rotation.x = THREE.MathUtils.damp(
            rig.headBone.rotation.x,
            rig.baseHeadRot.x + targetGazeX,
            5,
            delta
          );
          rig.headBone.rotation.z = THREE.MathUtils.damp(
            rig.headBone.rotation.z,
            rig.baseHeadRot.z + targetGazeZ,
            5,
            delta
          );
        } else {
          customModelRef.current.rotation.y = rig.baseRotY + swayY + targetGazeY * 0.4;
          customModelRef.current.rotation.x = THREE.MathUtils.damp(
            customModelRef.current.rotation.x,
            targetGazeX * 0.3 + replyingSpinePitch * 0.5,
            4.5,
            delta
          );
        }

        // 6. Arm and Hand Posing: Keep hands and arms tucked gracefully close to her body
        for (const arm of rig.leftArmBones) {
          const armSway = Math.sin(elapsed * 2.2) * 0.008;
          arm.bone.rotation.x = THREE.MathUtils.damp(arm.bone.rotation.x, arm.targetRot.x + armSway, 5, delta);
          arm.bone.rotation.y = THREE.MathUtils.damp(arm.bone.rotation.y, arm.targetRot.y, 5, delta);
          arm.bone.rotation.z = THREE.MathUtils.damp(arm.bone.rotation.z, arm.targetRot.z, 5, delta);
        }
        for (const arm of rig.rightArmBones) {
          const armSway = Math.sin(elapsed * 2.2) * 0.008;
          arm.bone.rotation.x = THREE.MathUtils.damp(arm.bone.rotation.x, arm.targetRot.x + armSway, 5, delta);
          arm.bone.rotation.y = THREE.MathUtils.damp(arm.bone.rotation.y, arm.targetRot.y, 5, delta);
          arm.bone.rotation.z = THREE.MathUtils.damp(arm.bone.rotation.z, arm.targetRot.z, 5, delta);
        }
      }

      // --- CUTE EYE MOVEMENTS & 'LOOK-AT-USER' CURSOR TRACKING ---
      const eyeGaze = cuteEyeGazeRef.current;
      eyeGaze.timer -= delta;
      if (eyeGaze.timer <= 0) {
        if (Math.abs(eyeGaze.targetGlanceX) > 0.01 || Math.abs(eyeGaze.targetGlanceY) > 0.01) {
          // Re-center loving gaze towards user
          eyeGaze.targetGlanceX = 0;
          eyeGaze.targetGlanceY = 0;
          eyeGaze.timer = 2.0 + Math.random() * 2.8;
        } else {
          // Cute subtle anime eye glance
          eyeGaze.targetGlanceX = (Math.random() - 0.5) * 0.09;
          eyeGaze.targetGlanceY = (Math.random() - 0.2) * 0.06;
          eyeGaze.timer = 0.5 + Math.random() * 0.8;
        }
      }
      eyeGaze.glanceX = THREE.MathUtils.damp(eyeGaze.glanceX, eyeGaze.targetGlanceX, 8, delta);
      eyeGaze.glanceY = THREE.MathUtils.damp(eyeGaze.glanceY, eyeGaze.targetGlanceY, 8, delta);

      // Animate custom model eyes to follow the cursor movement within the 3D viewport
      const eyeFollowX = -mouseRef.current.x * 0.32 + eyeGaze.glanceX * 0.22;
      const eyeFollowY = mouseRef.current.y * 0.24 + eyeGaze.glanceY * 0.22;

      if (customModelRef.current) {
        const rig = customRigRef.current;
        for (const eb of rig.eyeBones) {
          eb.bone.rotation.y = THREE.MathUtils.damp(
            eb.bone.rotation.y,
            eb.baseRot.y + eyeFollowX,
            9,
            delta
          );
          eb.bone.rotation.x = THREE.MathUtils.damp(
            eb.bone.rotation.x,
            eb.baseRot.x + eyeFollowY,
            9,
            delta
          );
        }

        // Animate gaze morph targets if present (VRM / anime blendshapes)
        const lookLeftWeight = Math.min(1.0, Math.max(0, -mouseRef.current.x * 1.2));
        const lookRightWeight = Math.min(1.0, Math.max(0, mouseRef.current.x * 1.2));
        const lookUpWeight = Math.min(1.0, Math.max(0, mouseRef.current.y * 1.2));
        const lookDownWeight = Math.min(1.0, Math.max(0, -mouseRef.current.y * 1.2));

        for (const m of rig.eyeLookMorphs.left) {
          if (m.mesh.morphTargetInfluences) {
            m.mesh.morphTargetInfluences[m.index] = THREE.MathUtils.damp(m.mesh.morphTargetInfluences[m.index], lookLeftWeight, 8, delta);
          }
        }
        for (const m of rig.eyeLookMorphs.right) {
          if (m.mesh.morphTargetInfluences) {
            m.mesh.morphTargetInfluences[m.index] = THREE.MathUtils.damp(m.mesh.morphTargetInfluences[m.index], lookRightWeight, 8, delta);
          }
        }
        for (const m of rig.eyeLookMorphs.up) {
          if (m.mesh.morphTargetInfluences) {
            m.mesh.morphTargetInfluences[m.index] = THREE.MathUtils.damp(m.mesh.morphTargetInfluences[m.index], lookUpWeight, 8, delta);
          }
        }
        for (const m of rig.eyeLookMorphs.down) {
          if (m.mesh.morphTargetInfluences) {
            m.mesh.morphTargetInfluences[m.index] = THREE.MathUtils.damp(m.mesh.morphTargetInfluences[m.index], lookDownWeight, 8, delta);
          }
        }
      }

      // Cute Flutter / Double-Blinking & Playful Wink
      const blink = blinkTimerRef.current;
      blink.elapsed += delta;
      if (blink.elapsed > blink.nextBlink) {
        blink.isBlinking = true;
        if (blink.elapsed > blink.nextBlink + blink.blinkDuration) {
          if (blink.isDoubleBlink) {
            blink.isBlinking = false;
            blink.isDoubleBlink = false;
            blink.elapsed = 0;
            blink.nextBlink = 2.4 + Math.random() * 3.2;
          } else if (Math.random() < 0.35) {
            // Cute second flutter blink
            blink.isDoubleBlink = true;
            blink.nextBlink = blink.elapsed + 0.09;
          } else {
            blink.isBlinking = false;
            blink.elapsed = 0;
            blink.nextBlink = 2.4 + Math.random() * 3.2;
          }
        }
      }

      // Wink animation handler
      const wink = winkTimerRef.current;
      if (wink.active) {
        wink.elapsed += delta;
        if (wink.elapsed > wink.duration) {
          wink.active = false;
        }
      }

      // Animate custom model eye blink morph targets
      if (customModelRef.current) {
        const rig = customRigRef.current;
        const blinkVal = blink.isBlinking ? 1.0 : (wink.active ? 1.0 : 0.0);
        if (rig.blinkMorphs.length > 0) {
          for (const bm of rig.blinkMorphs) {
            if (bm.mesh.morphTargetInfluences) {
              bm.mesh.morphTargetInfluences[bm.index] = THREE.MathUtils.damp(
                bm.mesh.morphTargetInfluences[bm.index],
                blinkVal,
                26,
                delta
              );
            }
          }
        }
      }

      // Procedural Anime Eyes: follow cursor for 'look-at-user' effect
      if (leftEyeRef.current && rightEyeRef.current) {
        const baseEyeScaleY = 1.0 - activeEmotion.eyeSquint * 0.35;
        let leftTarget = blink.isBlinking ? 0.06 : baseEyeScaleY;
        let rightTarget = blink.isBlinking ? 0.06 : baseEyeScaleY;

        // If winking, close left eye playfully while right eye remains open
        if (wink.active) {
          leftTarget = 0.05;
          rightTarget = 1.05; // Slightly wider sparkling right eye
        }

        leftEyeRef.current.scale.y = THREE.MathUtils.damp(leftEyeRef.current.scale.y, leftTarget, 22, delta);
        rightEyeRef.current.scale.y = THREE.MathUtils.damp(rightEyeRef.current.scale.y, rightTarget, 22, delta);

        // Eyes actively follow cursor with subtle sweet micro-glances
        const pupilFollowX = mouseRef.current.x * 0.05 + eyeGaze.glanceX * 0.035;
        const pupilFollowY = mouseRef.current.y * 0.04 + eyeGaze.glanceY * 0.025;
        leftEyeRef.current.position.x = -0.17 + pupilFollowX;
        leftEyeRef.current.position.y = 0.06 + pupilFollowY;
        rightEyeRef.current.position.x = 0.17 + pupilFollowX;
        rightEyeRef.current.position.y = 0.06 + pupilFollowY;
      }

      // Procedural bust leaning forward when answering
      if (characterGroupRef.current && characterGroupRef.current.visible) {
        characterGroupRef.current.position.z = THREE.MathUtils.damp(
          characterGroupRef.current.position.z,
          replyingLeanZ + touchReactionRef.current * 0.08,
          4.0,
          delta
        );
      }
      if (torsoGroupRef.current) {
        torsoGroupRef.current.rotation.x = THREE.MathUtils.damp(
          torsoGroupRef.current.rotation.x,
          replyingSpinePitch + Math.sin(elapsed * 2.2) * 0.015,
          4.0,
          delta
        );
      }

      // --- DYNAMIC HAIR REACTIVE PHYSICS TO MOUSE CURSOR ---
      // Calculates cursor inertia and velocity spring force so hair realistically sways with pointer movement
      const hairWindZ = mouseRef.current.x * 0.14 - mouseRef.current.velX * 0.045;
      const hairWindX = mouseRef.current.y * 0.08 - mouseRef.current.velY * 0.035;
      const naturalHairSway = Math.sin(elapsed * 2.5) * 0.028;

      if (customModelRef.current) {
        const rig = customRigRef.current;
        for (const hb of rig.hairBones) {
          hb.bone.rotation.z = THREE.MathUtils.damp(
            hb.bone.rotation.z,
            hb.baseZ + naturalHairSway + hairWindZ,
            5.5,
            delta
          );
          hb.bone.rotation.x = THREE.MathUtils.damp(
            hb.bone.rotation.x,
            hb.baseX + hairWindX,
            5.5,
            delta
          );
        }
      }

      const hairInertia = hairWindZ + naturalHairSway;
      if (sideLockLRef.current) {
        sideLockLRef.current.rotation.z = 0.4 + hairInertia;
      }
      if (sideLockRRef.current) {
        sideLockRRef.current.rotation.z = -0.4 + hairInertia;
      }
      if (bunLRef.current && bunRRef.current) {
        bunLRef.current.rotation.z = 0.4 + hairInertia * 0.8;
        bunRRef.current.rotation.z = -0.4 + hairInertia * 0.8;
      }

      // 5. Mouth Animation Removed: Mouth and jaw stay at resting curvature with zero flapping
      if (customModelRef.current) {
        const rig = customRigRef.current;

        // Keep any mouth morphs at 0
        if (rig.mouthMorphs.length > 0) {
          for (const mm of rig.mouthMorphs) {
            if (mm.mesh.morphTargetInfluences) {
              mm.mesh.morphTargetInfluences[mm.index] = 0;
            }
          }
        }
        // Keep jaw at resting rotation
        if (rig.jawBone) {
          rig.jawBone.rotation.x = THREE.MathUtils.damp(
            rig.jawBone.rotation.x,
            rig.baseJawRot.x,
            6,
            delta
          );
        }

        // Custom model smile / emotion warmth morphs (warmth/eyes/cheeks only, no mouth opening)
        if (rig.smileMorphs.length > 0) {
          const targetSmile = activeEmotion.smileIntensity;
          for (const sm of rig.smileMorphs) {
            if (sm.mesh.morphTargetInfluences) {
              sm.mesh.morphTargetInfluences[sm.index] = THREE.MathUtils.damp(
                sm.mesh.morphTargetInfluences[sm.index],
                targetSmile,
                6,
                delta
              );
            }
          }
        }
      }

      // Static resting procedural mouth mesh (cute anime mouth curve without speech flapping)
      if (mouthMeshRef.current) {
        const targetScaleY = 0.35 + activeEmotion.smileIntensity * 0.12;
        const targetScaleX = 0.95 + activeEmotion.smileIntensity * 0.25;

        mouthMeshRef.current.scale.y = THREE.MathUtils.damp(mouthMeshRef.current.scale.y, targetScaleY, 12, delta);
        mouthMeshRef.current.scale.x = THREE.MathUtils.damp(mouthMeshRef.current.scale.x, targetScaleX, 12, delta);
      }

      // 6. Dynamic Romantic Cheek Blush
      if (blushLeftRef.current && blushRightRef.current) {
        const matL = blushLeftRef.current.material as THREE.MeshBasicMaterial;
        const matR = blushRightRef.current.material as THREE.MeshBasicMaterial;
        const targetOpacity = Math.min(1.0, activeEmotion.blushIntensity + touchReactionRef.current * 0.25);

        matL.opacity = THREE.MathUtils.damp(matL.opacity, targetOpacity, 6, delta);
        matR.opacity = THREE.MathUtils.damp(matR.opacity, targetOpacity, 6, delta);
      }

      controls.update();
      renderer.render(scene, camera);
    };

    tick();

    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [buildProceduralAnimeBust]);

  return (
    <div
      ref={mountRef}
      onClick={handleViewportClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="relative w-full h-full cursor-grab active:cursor-grabbing overflow-hidden"
    >
      {/* Welcoming Anime Partner Portal when no model is active (zero dummy models) */}
      {!hasLoadedModel && loadingProgress === null && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center pointer-events-none p-6 text-center">
          <div className="bg-[#10141f]/90 border border-white/10 rounded-3xl p-8 max-w-sm shadow-2xl backdrop-blur-md pointer-events-auto">
            <div className="w-16 h-16 rounded-full bg-rose-500/20 border border-rose-500/30 flex items-center justify-center mx-auto mb-4 text-rose-400">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-white mb-1.5">Mikasa · Virtual Anime Partner</h2>
            <p className="text-xs text-slate-300 leading-relaxed mb-5">
              Upload your 3D female anime model (.glb, .gltf, or .vrm) to set her as your permanent built-in companion with natural animations!
            </p>
            <button
              onClick={() => {
                const input = document.getElementById('model-file-input') as HTMLInputElement | null;
                input?.click();
              }}
              className="w-full py-2.5 px-4 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-all shadow-lg shadow-rose-600/30 cursor-pointer flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              <span>Load 3D Anime Model</span>
            </button>
          </div>
        </div>
      )}

      {/* Loading Bar */}
      {loadingProgress !== null && (
        <div className="absolute top-6 left-1/2 -translate-x-1/2 z-20 flex items-center gap-3 bg-slate-900/90 border border-slate-700/60 rounded-xl px-5 py-2.5 shadow-xl">
          <div className="w-4 h-4 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-medium text-slate-200">
            Framing 3D Anime Partner ({loadingProgress}%)
          </span>
        </div>
      )}

      {/* Hidden file input */}
      <input
        type="file"
        id="model-file-input"
        accept=".glb,.gltf,.vrm"
        className="hidden"
        onChange={(e) => {
          if (e.target.files && e.target.files[0]) {
            loadCustomModelFile(e.target.files[0]);
          }
        }}
      />
    </div>
  );
};
