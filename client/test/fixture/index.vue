<style scoped>
    .test-vue-scoped-class{
        color: red;
    }
</style>

<style scoped lang="css">
    .test-vue-scoped-class-css{
        color: red;
    }

    .test-vue-class-keyed{
        color: red;
    }

    .test_vue_class_keyed{
        color: red;
    }
</style>

<style scoped lang="scss">
    .test-vue-scoped-class{
        &-scss{
            color: red;
        }
    }
</style>

<style scoped lang="less">
    .test-vue-scoped-class{
        &-less{
            color: red;
        }
    }
</style>

<template>
    <div class="test-vue-scoped-class">Test Text</div>
    <div class="test-vue-scoped-class-css">Test Text</div>
    <div class="test-vue-scoped-class-scss">Test Text</div>
    <div :class="'test-vue-scoped-class-less'">Test Text</div>

    <div class="test-vue-import-class">Test Text</div>
    <div class="class-style-imported">Test Text</div>

    <div :class="{'test-vue-class-keyed': boolean}"></div>
    <div :class="{test_vue_class_keyed: boolean}"></div>
    <div :class="vue_variable_not_class"></div>
    
    <div :class="`cName-${variable}`"></div>
    <div :class="`cName-${variable ? 'A' : 'B'}`"></div>
</template>


<script>
import "./css/test.scss"
import "./node_modules/test-module/style-imported.scss"
</script>
